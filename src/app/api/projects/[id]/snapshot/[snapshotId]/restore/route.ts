import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, notFound, badRequest } from "@/lib/api/errors";
import { snapshotDataSchema } from "@/lib/recovery/types";
import { trackEvent } from "@/lib/analytics/track";
import { serializeProjectWithAssets } from "@/lib/storage/serialize-project";
import { ProjectStatus } from "@/generated/prisma/client";

const VALID_STATUSES = new Set<string>(Object.values(ProjectStatus));

type RouteContext = {
  params: Promise<{ id: string; snapshotId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id, snapshotId } = await context.params;
    const { user } = await requireProjectAccess(id);

    const record = await prisma.recoverySnapshot.findFirst({
      where: { id: snapshotId, projectId: id },
    });

    if (!record) {
      throw notFound("Snapshot not found");
    }

    const parsed = snapshotDataSchema.safeParse(record.data);
    if (!parsed.success) {
      throw badRequest("Snapshot data is invalid or corrupted");
    }

    const snap = parsed.data;
    const p = snap.project;

    const updated = await prisma.project.update({
      where: { id },
      data: {
        title: p.title,
        status: VALID_STATUSES.has(p.status)
          ? (p.status as Prisma.ProjectUpdateInput["status"])
          : undefined,
        propertyData: p.propertyData as Prisma.InputJsonValue,
        extractedFacts: p.extractedFacts as Prisma.InputJsonValue,
        validatedFacts:
          p.validatedFacts !== undefined
            ? (p.validatedFacts as Prisma.InputJsonValue)
            : undefined,
        targetAudience: p.targetAudience ?? undefined,
        language: p.language,
        tone: p.tone,
        ctaStyle: p.ctaStyle,
        durationSeconds: p.durationSeconds,
        lastSavedAt: new Date(),
      },
      include: {
        template: true,
        scriptVersions: {
          orderBy: [{ generationBatch: "desc" }, { versionNumber: "asc" }],
        },
        contentPacks: { where: { isActive: true }, take: 1 },
        audioAssets: { orderBy: { createdAt: "desc" }, take: 1 },
        mediaAssets: { orderBy: { createdAt: "desc" }, take: 12 },
        _count: {
          select: {
            scriptVersions: true,
            mediaAssets: true,
            exportJobs: true,
            audioAssets: true,
            contentPacks: true,
          },
        },
      },
    });

    if (snap.selectedScriptId) {
      const script = await prisma.scriptVersion.findFirst({
        where: { id: snap.selectedScriptId, projectId: id },
      });
      if (script) {
        await prisma.$transaction([
          prisma.scriptVersion.updateMany({
            where: { projectId: id },
            data: { isActive: false },
          }),
          prisma.scriptVersion.update({
            where: { id: snap.selectedScriptId },
            data: { isActive: true },
          }),
        ]);
      }
    }

    await trackEvent(user.id, "project_restored", {
      projectId: id,
      snapshotId,
      source: record.source,
    });

    return NextResponse.json({
      project: serializeProjectWithAssets(updated),
      restored: {
        snapshotId,
        activeTab: snap.activeTab,
        selectedScriptId: snap.selectedScriptId,
        savedAt: snap.savedAt,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
