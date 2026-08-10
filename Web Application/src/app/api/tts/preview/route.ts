import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { handleRouteError, unauthorized } from "@/lib/api/errors";
import { synthesizeGoogleSpeechWithMetadata } from "@/lib/tts/google-cloud-tts";
import { buildPreviewCacheKey, sampleTextFor } from "@/lib/tts/preview-cache";
import { createGeminiVoicePersona, resolveSpeakingInstructions } from "@/lib/tts/voices";
import { ttsPreviewBodySchema } from "@/lib/validations/voice-presets";

/** Short synthesis only — no STT alignment or storage, so this stays fast. */
export const maxDuration = 45;

function audioResponse(audio: Buffer | Uint8Array, mimeType: string, cache: "hit" | "miss") {
  return new NextResponse(Buffer.from(audio) as unknown as BodyInit, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "no-store",
      "X-Preview-Cache": cache,
    },
  });
}

export async function POST(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const body = ttsPreviewBodySchema.parse(await request.json());
    const { voiceName, languageCode, styleId, customInstructions, pitch, pace, emotion, energy } = body;

    const voice = createGeminiVoicePersona(voiceName, languageCode);
    if (!voice) {
      return NextResponse.json({ error: "Unknown voice" }, { status: 400 });
    }

    const { full: speakingInstructions, condensed: condensedSpeakingInstructions } =
      resolveSpeakingInstructions({ voice, styleId, customInstructions, pitch, pace, emotion, energy });

    // Samples are deterministic per voice+language+instructions (the spoken
    // text is fixed), so cache them globally — replaying a known style costs
    // zero Gemini credits. The voice/style grid is pre-warmed offline by
    // scripts/warm-tts-preview-cache.ts; only a genuinely new custom prompt
    // (or an uncovered voice/language/style combo) synthesizes live here.
    const cacheKey = buildPreviewCacheKey(voiceName, languageCode, speakingInstructions);

    const cached = await prisma.ttsPreviewSample.findUnique({ where: { cacheKey } });
    if (cached) {
      return audioResponse(cached.audio, cached.mimeType, "hit");
    }

    const { buffer } = await synthesizeGoogleSpeechWithMetadata({
      text: sampleTextFor(languageCode),
      voice,
      speakingInstructions,
      condensedSpeakingInstructions,
    });

    const mimeType = buffer.toString("ascii", 0, 4) === "RIFF" ? "audio/wav" : "audio/mpeg";

    // Two users previewing the same combo concurrently can race on the unique
    // cacheKey — losing the race is fine, we already have the audio to return.
    await prisma.ttsPreviewSample
      .create({
        data: { cacheKey, voiceName, languageCode, styleId: styleId ?? null, mimeType, audio: new Uint8Array(buffer) },
      })
      .catch(() => {});

    return audioResponse(buffer, mimeType, "miss");
  } catch (error) {
    return handleRouteError(error);
  }
}
