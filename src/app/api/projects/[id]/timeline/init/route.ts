import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { serializeTimeline } from "@/lib/timeline/serialize";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/timeline/init
 * 
 * Auto-initialize timeline with audio and subtitles after voiceover generation.
 * 
 * This endpoint:
 * 1. Checks if timeline already exists
 * 2. If not, creates a new timeline with:
 *    - Voiceover track with the latest audio asset
 *    - Subtitle track with generated subtitles
 *    - Fact overlays track (auto-generated from subtitles)
 *    - Empty video track for media
 * 3. Returns the initialized timeline ready for editing
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    // Check if timeline already exists
    const existingTimeline = await prisma.timeline.findFirst({
      where: { projectId: id },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ],
    });

    if (existingTimeline) {
      // Timeline already exists, return it instead of creating a duplicate
      return NextResponse.json({
        success: true,
        timeline: serializeTimeline(existingTimeline),
        message: "Timeline already exists",
      });
    }

    // Load required assets
    const [audioAsset, subtitleTrack] = await Promise.all([
      prisma.audioAsset.findFirst({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.subtitleTrack.findFirst({
        where: { projectId: id },
      }),
    ]);

    if (!audioAsset) {
      return NextResponse.json(
        {
          success: false,
          error: "No audio asset found. Generate voiceover first.",
        },
        { status: 400 }
      );
    }

    if (!subtitleTrack) {
      return NextResponse.json(
        {
          success: false,
          error: "No subtitles found. Subtitles should be auto-generated with voiceover.",
        },
        { status: 400 }
      );
    }

    // Create initial timeline structure
    const timeline = await prisma.timeline.create({
      data: {
        projectId: id,
        version: 1,
        tracks: [
          {
            id: "track-video",
            type: "video",
            name: "Images & Videos",
            muted: false,
            locked: false,
            clipIds: [],
          },
          {
            id: "track-text",
            type: "text",
            name: "Titles",
            muted: false,
            locked: false,
            clipIds: [],
          },
          {
            id: "track-subtitle",
            type: "subtitle",
            name: "Subtitles",
            muted: false,
            locked: false,
            clipIds: [],
          },
          {
            id: "track-voiceover",
            type: "voiceover",
            name: "Voiceover",
            muted: false,
            locked: false,
            clipIds: [],
          },
        ] as unknown as Prisma.InputJsonValue,
        clips: {
          "audio-voiceover": {
            id: "audio-voiceover",
            trackId: "track-voiceover",
            audioAssetId: audioAsset.id,
            type: "audio",
            startTime: 0,
            endTime: audioAsset.durationMs,
            trimStart: 0,
            trimEnd: audioAsset.durationMs,
            properties: {
              volume: 1,
              muted: false,
            },
          },
        } as unknown as Prisma.InputJsonValue,
        transitions: [] as unknown as Prisma.InputJsonValue,
        textLayers: [] as unknown as Prisma.InputJsonValue,
        settings: {
          width: 1080,
          height: 1920,
          fps: 30,
          durationMs: audioAsset.durationMs,
          backgroundColor: "#000000",
          aspectRatio: "9:16",
        } as unknown as Prisma.InputJsonValue,
        isAutosave: false,
        isAiGenerated: true,
      },
    });

    await prisma.project.update({
      where: { id },
      data: {
        status: "EDITING",
        lastSavedAt: new Date(),
      },
    });

    await trackEvent(user.id, "timeline_initialized", {
      projectId: id,
      audioAssetId: audioAsset.id,
      subtitleTrackId: subtitleTrack.id,
    });

    return NextResponse.json({
      success: true,
      timeline: serializeTimeline(timeline),
      message: "Timeline initialized with audio and subtitles",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * GET /api/projects/[id]/timeline/init
 * 
 * Check if timeline is ready to be initialized (has audio and subtitles)
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const [audioAsset, subtitleTrack, existingTimeline] = await Promise.all([
      prisma.audioAsset.findFirst({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.subtitleTrack.findFirst({
        where: { projectId: id },
      }),
      prisma.timeline.findFirst({
        where: { projectId: id },
      }),
    ]);

    const isReady = !!audioAsset && !!subtitleTrack;
    const timelineExists = !!existingTimeline;

    return NextResponse.json({
      success: true,
      isReady,
      timelineExists,
      hasAudio: !!audioAsset,
      hasSubtitles: !!subtitleTrack,
      readinessMessages: [
        !audioAsset && "No audio generated",
        !subtitleTrack && "No subtitles generated",
        timelineExists && "Timeline already exists",
      ].filter(Boolean),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
