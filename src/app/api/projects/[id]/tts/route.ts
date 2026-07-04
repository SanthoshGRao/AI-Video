import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { saveBufferAsync } from "@/lib/storage/local";
import { StorageCategory } from "@/lib/storage/paths";
import { serializeAudioAsset } from "@/lib/storage/serialize";
import { ttsBodySchema } from "@/lib/validations/upload";
import { synthesizeVoiceover } from "@/lib/tts/synthesize-voiceover";
import { resolveVoicePersona } from "@/lib/tts/voices";

/** Allow up to 120s for TTS synthesis + STT alignment on Vercel */
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const body = ttsBodySchema.parse(await request.json());
    const { scriptVersionId, text, voiceType = "Charon", languageCode } = body;

    const voice = resolveVoicePersona(voiceType, languageCode);
    const { audioBuffer, durationMs, sync } = await synthesizeVoiceover(text, voice);

    const fileExt = audioBuffer.toString("ascii", 0, 4) === "RIFF" ? "wav" : "mp3";
    const fileName = `tts-${Date.now()}.${fileExt}`;
    const saved = await saveBufferAsync(StorageCategory.AUDIO, id, fileName, audioBuffer);

    const audioAsset = await prisma.audioAsset.create({
      data: {
        projectId: id,
        scriptVersionId: scriptVersionId ?? null,
        voiceType: voice.label,
        localPath: saved.localPath,
        r2Key: saved.key,
        r2Url: saved.url,
        durationMs,
        wordTimestamps: sync as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      audioAsset: serializeAudioAsset(audioAsset),
      syncSource: sync.syncSource,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
