import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { snapshotBodySchema } from "@/lib/validations/upload";
import { buildSnapshotPayload } from "@/lib/recovery/build-snapshot";
import { snapshotDataSchema } from "@/lib/recovery/types";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_SNAPSHOTS = 20;

async function pruneSnapshots(projectId: string) {
  const now = new Date();

  await prisma.recoverySnapshot.deleteMany({
    where: { projectId, expiresAt: { lt: now } },
  });

  const count = await prisma.recoverySnapshot.count({ where: { projectId } });
  if (count > MAX_SNAPSHOTS) {
    const toDelete = await prisma.recoverySnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      take: count - MAX_SNAPSHOTS,
      select: { id: true },
    });
    await prisma.recoverySnapshot.deleteMany({
      where: { id: { in: toDelete.map((d) => d.id) } },
    });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const project = await prisma.project.findFirst({
      where: { id },
      include: {
        scriptVersions: {
          select: { generationBatch: true },
          orderBy: { generationBatch: "desc" },
          take: 10,
        },
        contentPacks: { where: { isActive: true }, take: 1 },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let clientState = {};
    try {
      const raw = await request.json();
      clientState = snapshotBodySchema.parse(raw);
    } catch {
      /* optional body */
    }

    const parsed = clientState as {
      tab?: string;
      selectedScriptId?: string | null;
      isEditingDetails?: boolean;
      editedRawText?: string;
      source?: "autosave" | "manual" | "pre_export";
    };

    const payload = buildSnapshotPayload(project, {
      activeTab: parsed.tab,
      selectedScriptId: parsed.selectedScriptId,
      isEditingDetails: parsed.isEditingDetails,
      editedRawText: parsed.editedRawText,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const snapshot = await prisma.recoverySnapshot.create({
      data: {
        projectId: id,
        source: parsed.source ?? "autosave",
        expiresAt,
        data: payload as object,
      },
    });

    await pruneSnapshots(id);

    return NextResponse.json({
      snapshot: {
        id: snapshot.id,
        projectId: snapshot.projectId,
        source: snapshot.source,
        createdAt: snapshot.createdAt.toISOString(),
        expiresAt: snapshot.expiresAt.toISOString(),
        data: payload,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const snapshots = await prisma.recoverySnapshot.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: MAX_SNAPSHOTS,
    });

    const parsed = snapshots.map((s) => {
      const dataResult = snapshotDataSchema.safeParse(s.data);
      return {
        id: s.id,
        projectId: s.projectId,
        source: s.source,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        data: dataResult.success ? dataResult.data : null,
      };
    });

    return NextResponse.json({
      latest: parsed[0] ?? null,
      snapshots: parsed,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
