import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, notFound } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string; jobId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, jobId } = await context.params;
    await requireProjectAccess(id);

    const job = await prisma.exportJob.findFirst({
      where: { id: jobId, projectId: id },
    });

    if (!job) throw notFound("Export job not found");

    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        renderProgress: job.renderProgress,
        downloadUrl: job.downloadUrl,
        errorMessage: job.errorMessage,
        fileSizeBytes: job.fileSizeBytes,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
