import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { generateTimelineBodySchema } from "@/lib/validations/timeline";
import { gatherTimelineContext } from "@/lib/timeline/gather-context";
import { generateAiTimelineDocument } from "@/lib/timeline/generate-ai";
import { serializeTimeline } from "@/lib/timeline/serialize";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    let body: {
      scriptVersionId?: string;
      audioAssetId?: string;
      replaceExisting?: boolean;
    } = {};
    try {
      body = generateTimelineBodySchema.parse(await request.json());
    } catch {
      body = {};
    }

    const ctx = await gatherTimelineContext(id, {
      scriptVersionId: body.scriptVersionId,
      audioAssetId: body.audioAssetId,
    });

    if (!ctx) {
      throw badRequest(
        "Upload at least one image or video and generate a voiceover before AI timeline."
      );
    }

    const { document, plan, source } = await generateAiTimelineDocument(ctx);

    const existing = await prisma.timeline.findFirst({
      where: { projectId: id },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ],
    });

    const nextVersion = (existing?.version ?? 0) + 1;

    const timeline = await prisma.timeline.create({
      data: {
        projectId: id,
        version: nextVersion,
        tracks: document.tracks as unknown as Prisma.InputJsonValue,
        clips: document.clips as unknown as Prisma.InputJsonValue,
        transitions: document.transitions as unknown as Prisma.InputJsonValue,
        textLayers: document.textLayers as unknown as Prisma.InputJsonValue,
        settings: document.settings as unknown as Prisma.InputJsonValue,
        isAutosave: false,
        isAiGenerated: true,
      },
    });

    await prisma.project.update({
      where: { id },
      data: { status: "EDITING", lastSavedAt: new Date() },
    });

    await trackEvent(user.id, "timeline_ai_generated", {
      projectId: id,
      version: timeline.version,
      sceneCount: plan.scenes.length,
      source,
      overlayCount: plan.textOverlays.length,
    });

    return NextResponse.json({
      timeline: serializeTimeline(timeline),
      meta: {
        source,
        sceneCount: plan.scenes.length,
        textOverlayCount: plan.textOverlays.length,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
