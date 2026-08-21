import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { handleRouteError, unauthorized } from "@/lib/api/errors";
import { synthesizeGoogleSpeechWithMetadata } from "@/lib/tts/google-cloud-tts";
import { createGeminiVoicePersona, resolveSpeakingInstructions } from "@/lib/tts/voices";
import { concatWav, wavDurationMs } from "@/lib/tts/wav-utils";
import { skitPreviewBodySchema, type SkitCastMember } from "@/lib/validations/skit";

/**
 * Table-read preview for a conversation script: each line is synthesized in its
 * character's own Gemini voice + delivery style, cached by content hash, and the
 * clips are returned in order (plus a stitched WAV for one-click download).
 */
export const maxDuration = 120;

const FALLBACK_VOICE = "Charon";
/** Cap concurrent TTS calls to respect Gemini API rate limits. */
const CONCURRENCY = 1;

/** Base silence between turns; a line's own pauseBeforeMs is added on top. */
const BASE_GAP_MS = 240;

type Clip = {
  index: number;
  speaker: string;
  text: string;
  audioBase64: string;
  mimeType: string;
  durationMs: number;
  pauseBeforeMs: number;
};

/**
 * Fold the line's stage-direction "situation" into the director's notes so the
 * model performs the moment. Explicitly told never to voice the direction.
 */
function withPerformanceContext(instructions: string, context?: string): string {
  const ctx = context?.trim();
  if (!ctx) return instructions;
  return `${instructions}

### PERFORMANCE CONTEXT (the situation — do NOT read this aloud)
${ctx}
Perform the line reflecting this exact moment, emotion, and timing. Speak ONLY the transcript line; never voice the stage directions.`;
}

/** Cache key for a single synthesized line (namespaced so it never collides
 * with the fixed-sample voice-preview cache that shares this table). */
function lineCacheKey(voiceName: string, languageCode: string, instructions: string, text: string) {
  return createHash("sha256")
    .update(`skit-line|${voiceName}|${languageCode}|${instructions}|${text}`)
    .digest("hex");
}

/** Resolve the voice + speaking instructions for one line's speaker. */
function resolveForSpeaker(member: SkitCastMember | undefined, fallbackLanguage: string) {
  const voiceName = member?.voiceName ?? FALLBACK_VOICE;
  const languageCode = member?.languageCode ?? fallbackLanguage;
  const voice = createGeminiVoicePersona(voiceName, languageCode)
    ?? createGeminiVoicePersona(FALLBACK_VOICE, languageCode)!;
  const { full, condensed } = resolveSpeakingInstructions({
    voice,
    styleId: member?.styleId ?? null,
    customInstructions: member?.customInstructions ?? null,
    pitch: member?.pitch,
    pace: member?.pace,
    emotion: member?.emotion,
    energy: member?.energy,
  });
  return { voice, voiceName: voice.geminiVoice ?? voiceName, languageCode, full, condensed };
}

export async function POST(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const { languageCode, lines, cast } = skitPreviewBodySchema.parse(await request.json());

    const castBySpeaker = new Map<string, SkitCastMember>();
    for (const member of cast) castBySpeaker.set(member.speaker, member);

    const synthesizeLine = async (index: number): Promise<Clip> => {
      const line = lines[index];
      const pauseBeforeMs = line.pauseBeforeMs ?? 0;
      const resolved = resolveForSpeaker(castBySpeaker.get(line.speaker), languageCode);
      // The situation shapes the read AND the cache key, so the same words in a
      // different moment re-synthesize instead of reusing the wrong take.
      const full = withPerformanceContext(resolved.full, line.context);
      const condensed = withPerformanceContext(resolved.condensed, line.context);
      const cacheKey = lineCacheKey(resolved.voiceName, resolved.languageCode, full, line.text);

      const cached = await prisma.ttsPreviewSample.findUnique({ where: { cacheKey } });
      if (cached) {
        const buf = Buffer.from(cached.audio);
        return {
          index,
          speaker: line.speaker,
          text: line.text,
          audioBase64: buf.toString("base64"),
          mimeType: cached.mimeType,
          durationMs: wavDurationMs(buf),
          pauseBeforeMs,
        };
      }

      const member = castBySpeaker.get(line.speaker);
      const { buffer } = await synthesizeGoogleSpeechWithMetadata({
        text: line.text,
        voice: resolved.voice,
        speakingInstructions: full,
        condensedSpeakingInstructions: condensed,
        pitch: member?.pitch,
        pace: member?.pace,
      });
      const mimeType = buffer.toString("ascii", 0, 4) === "RIFF" ? "audio/wav" : "audio/mpeg";

      // Content-hash keyed, so a second click on an unchanged line is free.
      await prisma.ttsPreviewSample
        .create({
          data: {
            cacheKey,
            voiceName: resolved.voiceName,
            languageCode: resolved.languageCode,
            styleId: null,
            mimeType,
            audio: new Uint8Array(buffer),
          },
        })
        .catch(() => {});

      return {
        index,
        speaker: line.speaker,
        text: line.text,
        audioBase64: buffer.toString("base64"),
        mimeType,
        durationMs: wavDurationMs(buffer),
        pauseBeforeMs,
      };
    };

    // Bounded-concurrency worker pool that preserves line order.
    const clips: Clip[] = new Array(lines.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, lines.length) }, async () => {
        while (true) {
          const i = next++;
          if (i >= lines.length) break;
          clips[i] = await synthesizeLine(i);
        }
      })
    );

    // Stitch a combined WAV for download (only if every clip is a real WAV).
    let combined: { audioBase64: string; mimeType: string; durationMs: number } | null = null;
    const buffers = clips.map((c) => Buffer.from(c.audioBase64, "base64"));
    if (clips.every((c) => c.mimeType === "audio/wav")) {
      // Lead silence before each clip = base gap + the line's own pause cue.
      const gaps = clips.map((c, i) => (i > 0 ? BASE_GAP_MS : 0) + c.pauseBeforeMs);
      const merged = concatWav(buffers, gaps);
      if (merged) {
        combined = {
          audioBase64: merged.toString("base64"),
          mimeType: "audio/wav",
          durationMs: wavDurationMs(merged),
        };
      }
    }

    return NextResponse.json({ clips, combined });
  } catch (error) {
    return handleRouteError(error);
  }
}
