import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { generateSubtitlesBodySchema } from "@/lib/validations/subtitles";
import { cuesFromAudioSync, parseCuesJson } from "@/lib/subtitles/cues";
import { parseAudioSync } from "@/lib/tts/types";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    let body = {};
    try {
      body = generateSubtitlesBodySchema.parse(await request.json());
    } catch {
      body = {};
    }

    const { audioAssetId, maxCharsPerCue } = body as {
      audioAssetId?: string;
      maxCharsPerCue?: number;
    };

    const audio = audioAssetId
      ? await prisma.audioAsset.findFirst({
          where: { id: audioAssetId, projectId: id },
        })
      : await prisma.audioAsset.findFirst({
          where: { projectId: id },
          orderBy: { createdAt: "desc" },
        });

    if (!audio) {
      throw badRequest("Generate a voiceover first, then create subtitles.");
    }

    const sync = parseAudioSync(audio.wordTimestamps);
    if (!sync || (sync.words.length === 0 && (sync.authoredPhrases?.length ?? 0) === 0)) {
      throw badRequest(
        "No subtitle timing data found on this voiceover. Regenerate the voiceover."
      );
    }
    const cues = cuesFromAudioSync(sync, { maxCharsPerCue });

    if (cues.length === 0) {
      throw badRequest("Could not build subtitle cues from audio sync.");
    }

    const existing = await prisma.subtitleTrack.findFirst({
      where: { projectId: id, audioAssetId: audio.id },
      orderBy: { updatedAt: "desc" },
    });

    const track = existing
      ? await prisma.subtitleTrack.update({
          where: { id: existing.id },
          data: {
            cues: cues as unknown as Prisma.InputJsonValue,
            language: "kannada_english", // Ensure we reset to the original language if it was translated to English
          },
        })
      : await prisma.subtitleTrack.create({
          data: {
            projectId: id,
            audioAssetId: audio.id,
            cues: cues as unknown as Prisma.InputJsonValue,
            stylePreset: "instagram_reels",
            isBurntIn: true,
            language: "kannada_english", // Or original language
          },
        });

    await trackEvent(user.id, "subtitles_generated", {
      projectId: id,
      cueCount: cues.length,
      syncSource: sync.syncSource,
    });

    return NextResponse.json({
      track: {
        ...track,
        cues: parseCuesJson(track.cues),
      },
      syncSource: sync.syncSource,
      cueCount: cues.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
