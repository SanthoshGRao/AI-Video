import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess, requireScriptInProject } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { saveBufferAsync } from "@/lib/storage/local";
import { StorageCategory } from "@/lib/storage/paths";
import { serializeAudioAsset } from "@/lib/storage/serialize";
import { voiceoverBodySchema } from "@/lib/validations/upload";
import { synthesizeVoiceover } from "@/lib/tts/synthesize-voiceover";
import { resolveVoicePersona } from "@/lib/tts/voices";
import { trackEvent } from "@/lib/analytics/track";
import { cuesFromAudioSync } from "@/lib/subtitles/cues";
import { parseAudioSync } from "@/lib/tts/types";

/** Allow up to 120s for TTS synthesis + STT alignment on Vercel */
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    const body = voiceoverBodySchema.parse(await request.json());
    const { scriptVersionId, voicePersona = "Charon", languageCode, styleId, customInstructions } = body;

    console.log(`[VOICEOVER_API] Request received:`, {
      voicePersona,
      languageCode,
      scriptVersionId,
      styleId,
      hasCustomInstructions: !!customInstructions?.trim(),
    });

    const script = await requireScriptInProject(scriptVersionId, id, user.id);
    const voice = resolveVoicePersona(voicePersona, languageCode);

    console.log(`[VOICEOVER_API] Voice resolved:`, {
      selectedPersona: voicePersona,
      resolvedLabel: voice.label,
      resolvedGeminiVoice: voice.geminiVoice,
      languageCode: voice.languageCode
    });

    const { audioBuffer, durationMs, sync, ttsProvider, styleLabel } = await synthesizeVoiceover(
      script.content,
      voice,
      { styleId, customInstructions }
    );

    const fileExt = audioBuffer.toString("ascii", 0, 4) === "RIFF" ? "wav" : "mp3";
    const fileName = `${id}-${Date.now()}.${fileExt}`;
    const saved = await saveBufferAsync(StorageCategory.AUDIO, id, fileName, audioBuffer);

    const audioAsset = await prisma.audioAsset.create({
      data: {
        projectId: id,
        scriptVersionId,
        voiceType: voice.label,
        voiceStyleLabel: styleLabel ?? null,
        localPath: saved.localPath,
        r2Key: saved.key,
        r2Url: saved.url,
        durationMs,
        wordTimestamps: sync as unknown as Prisma.InputJsonValue,
      },
    });

    // Automatically generate/update SubtitleTrack for the regenerated voiceover
    const parsedSync = parseAudioSync(audioAsset.wordTimestamps);
    if (parsedSync && (parsedSync.words.length > 0 || (parsedSync.authoredPhrases?.length ?? 0) > 0)) {
      const cues = cuesFromAudioSync(parsedSync);
      if (cues.length > 0) {
        const existingTrack = await prisma.subtitleTrack.findFirst({
          where: { projectId: id },
          orderBy: { updatedAt: "desc" },
        });

        if (existingTrack) {
          await prisma.subtitleTrack.update({
            where: { id: existingTrack.id },
            data: {
              audioAssetId: audioAsset.id,
              cues: cues as unknown as Prisma.InputJsonValue,
            },
          });
        } else {
          await prisma.subtitleTrack.create({
            data: {
              projectId: id,
              audioAssetId: audioAsset.id,
              cues: cues as unknown as Prisma.InputJsonValue,
              stylePreset: "instagram_reels",
              isBurntIn: true,
            },
          });
        }
      }
    }

    await prisma.project.update({
      where: { id },
      data: { status: "CONTENT_READY" },
    });

    await trackEvent(user.id, "voiceover_generated", {
      projectId: id,
      syncSource: sync.syncSource,
      ttsProvider,
      wordCount: sync.words.length,
    });

    return NextResponse.json({
      success: true,
      audioAsset: serializeAudioAsset(audioAsset),
      ttsProvider,
      syncSource: sync.syncSource,
      wordTimestampsCount: sync.words.length,
      sentenceCount: sync.sentences.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
