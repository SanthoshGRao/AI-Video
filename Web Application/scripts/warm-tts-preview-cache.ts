import { config } from "dotenv";
import path from "node:path";

// Must run before any module that reads env vars at import time (Prisma client).
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { synthesizeGoogleSpeechWithMetadata } from "../src/lib/tts/google-cloud-tts";
import { buildPreviewCacheKey, sampleTextFor } from "../src/lib/tts/preview-cache";
import { createGeminiVoicePersona, resolveSpeakingInstructions, GEMINI_VOICES, STYLE_PRESETS } from "../src/lib/tts/voices";

/**
 * One-time (re-runnable) batch job: pre-synthesizes every voice x style x
 * language preview sample and stores it in TtsPreviewSample, so the live
 * /api/tts/preview endpoint never has to call Gemini for a known combo.
 * Safe to re-run — already-cached combos are skipped via cacheKey lookup.
 *
 * Usage: npx tsx scripts/warm-tts-preview-cache.ts
 * Optional: WARM_LANGUAGES="kn-IN,en-US" to override the language list below.
 */

const LANGUAGES = (process.env.WARM_LANGUAGES?.split(",").map((s) => s.trim()).filter(Boolean)) ?? [
  "kn-IN",
  "en-US",
];

const VOICE_FILTER = process.env.WARM_VOICES?.split(",").map((s) => s.trim()).filter(Boolean);
const VOICES = VOICE_FILTER ? GEMINI_VOICES.filter((v) => VOICE_FILTER.includes(v.name)) : GEMINI_VOICES;

// null = "Voice Default" (the voice's own persona instructions, no style override)
const STYLE_IDS: (string | null)[] = [null, ...STYLE_PRESETS.map((p) => p.id)];

const DELAY_BETWEEN_CALLS_MS = 350;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  if (!process.env.GOOGLE_AI_API_KEY && !process.env.GOOGLE_CLOUD_API_KEY) {
    throw new Error("GOOGLE_AI_API_KEY (or GOOGLE_CLOUD_API_KEY) is not set");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const combos: { voiceName: string; languageCode: string; styleId: string | null }[] = [];
  for (const languageCode of LANGUAGES) {
    for (const voice of VOICES) {
      for (const styleId of STYLE_IDS) {
        combos.push({ voiceName: voice.name, languageCode, styleId });
      }
    }
  }

  console.log(
    `[warm-cache] ${combos.length} combos: ${VOICES.length} voices x ${STYLE_IDS.length} styles x ${LANGUAGES.length} language(s) [${LANGUAGES.join(", ")}]`
  );

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const failures: { voiceName: string; languageCode: string; styleId: string | null; error: string }[] = [];

  for (let i = 0; i < combos.length; i++) {
    const { voiceName, languageCode, styleId } = combos[i];
    const tag = `[${i + 1}/${combos.length}] ${languageCode} | ${voiceName} | ${styleId ?? "voice-default"}`;

    try {
      const voice = createGeminiVoicePersona(voiceName, languageCode);
      if (!voice) throw new Error("createGeminiVoicePersona returned null");

      const { full, condensed } = resolveSpeakingInstructions({ voice, styleId, customInstructions: undefined });
      const cacheKey = buildPreviewCacheKey(voiceName, languageCode, full);

      const existing = await prisma.ttsPreviewSample.findUnique({ where: { cacheKey } });
      if (existing) {
        skipped++;
        console.log(`${tag} -> already cached`);
        continue;
      }

      const started = Date.now();
      const { buffer } = await synthesizeGoogleSpeechWithMetadata({
        text: sampleTextFor(languageCode),
        voice,
        speakingInstructions: full,
        condensedSpeakingInstructions: condensed,
      });
      const mimeType = buffer.toString("ascii", 0, 4) === "RIFF" ? "audio/wav" : "audio/mpeg";

      await prisma.ttsPreviewSample.create({
        data: { cacheKey, voiceName, languageCode, styleId, mimeType, audio: new Uint8Array(buffer) },
      });

      generated++;
      console.log(`${tag} -> generated (${((Date.now() - started) / 1000).toFixed(1)}s, ${buffer.length}b)`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ voiceName, languageCode, styleId, error: message });
      console.warn(`${tag} -> FAILED: ${message}`);
    }

    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  console.log("\n[warm-cache] Done.");
  console.log(`  generated: ${generated}`);
  console.log(`  skipped (already cached): ${skipped}`);
  console.log(`  failed: ${failed}`);
  if (failures.length > 0) {
    console.log("\n[warm-cache] Failures:");
    for (const f of failures) {
      console.log(`  ${f.languageCode} | ${f.voiceName} | ${f.styleId ?? "voice-default"}: ${f.error}`);
    }
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error("[warm-cache] Fatal error:", err);
  process.exit(1);
});
