import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { saveTimelineBodySchema } from "@/lib/validations/timeline";
import { syncTrackClipIds } from "@/lib/timeline/parse";
import { serializeTimeline } from "@/lib/timeline/serialize";
import { assertValidTimeline } from "@/lib/timeline/validate";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

async function getLatestTimeline(projectId: string) {
  return prisma.timeline.findFirst({
    where: { projectId },
    orderBy: [
      { version: "desc" },
      { createdAt: "desc" }
    ],
  });
}

/**
 * Retry once on a Postgres serialization failure (Prisma P2034) — the
 * expected, recoverable outcome of two concurrent SERIALIZABLE writers
 * racing on the same project's timeline (e.g. overlapping autosaves).
 */
async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return await fn();
    }
    throw error;
  }
}

/**
 * Read-decide-write the latest Timeline row inside a SERIALIZABLE
 * transaction, so two concurrent saves (autosave + manual save, or two
 * tabs) can't both read the same "latest" row and both take the create
 * branch — one will get a P2034 and retry against the now-current state.
 */
async function saveTimelineRow(
  projectId: string,
  isAutosave: boolean,
  bumpVersion: boolean,
  payload: {
    tracks: Prisma.InputJsonValue;
    clips: Prisma.InputJsonValue;
    transitions: Prisma.InputJsonValue;
    textLayers: Prisma.InputJsonValue;
    settings: Prisma.InputJsonValue;
    isAutosave: boolean;
  }
) {
  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const existing = await tx.timeline.findFirst({
          where: { projectId },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        });

        if (existing && isAutosave && !bumpVersion && existing.isAutosave) {
          return tx.timeline.update({ where: { id: existing.id }, data: payload });
        }
        if (existing && !bumpVersion && !isAutosave) {
          return tx.timeline.update({ where: { id: existing.id }, data: { ...payload, isAutosave: false } });
        }
        const nextVersion = (existing?.version ?? 0) + 1;
        return tx.timeline.create({
          data: {
            projectId,
            version: nextVersion,
            ...payload,
            isAiGenerated: existing?.isAiGenerated ?? false,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const timeline = await getLatestTimeline(id);
    const versions = await prisma.timeline.findMany({
      where: { projectId: id },
      select: { id: true, version: true, createdAt: true, isAiGenerated: true },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ],
      take: 10,
    });

    return NextResponse.json({
      timeline: timeline ? serializeTimeline(timeline) : null,
      versions,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    const body = await request.json();
    const parsed = saveTimelineBodySchema.safeParse(body);
    if (!parsed.success) {
      console.error("[TIMELINE_SAVE_ERROR] Validation failed:", parsed.error);
      return handleRouteError(badRequest("Invalid timeline data", parsed.error));
    }
    const doc = syncTrackClipIds({
      tracks: parsed.data.tracks,
      clips: parsed.data.clips,
      transitions: parsed.data.transitions,
      textLayers: parsed.data.textLayers,
      settings: {
        ...parsed.data.settings,
        backgroundColor: parsed.data.settings.backgroundColor ?? "#000000",
      },
    });

    assertValidTimeline(doc);

    const isAutosave = body.isAutosave ?? false;
    const bumpVersion = body.bumpVersion ?? false;

    const payload = {
      tracks: doc.tracks as unknown as Prisma.InputJsonValue,
      clips: doc.clips as unknown as Prisma.InputJsonValue,
      transitions: doc.transitions as unknown as Prisma.InputJsonValue,
      textLayers: doc.textLayers as unknown as Prisma.InputJsonValue,
      settings: doc.settings as unknown as Prisma.InputJsonValue,
      isAutosave,
    };

    const timeline = await saveTimelineRow(id, isAutosave, bumpVersion, payload);

    await prisma.project.update({
      where: { id },
      data: { status: "EDITING", lastSavedAt: new Date() },
    });

    await trackEvent(user.id, "timeline_saved", {
      projectId: id,
      version: timeline.version,
      clipCount: Object.keys(doc.clips).length,
      isAutosave,
    });

    return NextResponse.json({ timeline: serializeTimeline(timeline) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Clip")) {
      return handleRouteError(badRequest(error.message));
    }
    return handleRouteError(error);
  }
}
