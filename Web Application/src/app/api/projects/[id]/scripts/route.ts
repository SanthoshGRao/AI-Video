import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { getLatestBatch } from "@/lib/scripts/utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const scripts = await prisma.scriptVersion.findMany({
      where: { projectId: id },
      orderBy: [{ generationBatch: "desc" }, { versionNumber: "asc" }],
    });

    const latestBatch = getLatestBatch(scripts);

    const batches = [...new Set(scripts.map((s) => s.generationBatch))].sort(
      (a, b) => b - a
    );

    return NextResponse.json({
      scripts,
      latestBatch,
      batches: batches.map((batch) => ({
        generationBatch: batch,
        createdAt: scripts.find((s) => s.generationBatch === batch)?.createdAt,
        scripts: scripts.filter((s) => s.generationBatch === batch),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
