import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, notFound } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string; jobId: string }> };

/**
 * Stored on cancelled jobs. There's no CANCELLED value in the ExportStatus
 * enum, so cancellation is recorded as FAILED with this message — the export
 * history UI reads it, while the dialog that issued the cancel already knows.
 */
const CANCELLED_MESSAGE = "Export cancelled by user";

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

/**
 * Stop an export the user no longer wants (the dialog's "Stop export" button,
 * or "Stop export & edit" in the mid-render edit warning).
 *
 * The Remotion render runs in-process with no abort handle, so this marks the
 * row terminal rather than killing the render: polling stops immediately, and
 * the render's own DONE write is a `updateMany … where status: RENDERING`
 * (see ../route.ts) so it can't resurrect a cancelled job. The desktop shell
 * has a real kill path and uses that instead — see export-control.ts.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, jobId } = await context.params;
    await requireProjectAccess(id);

    const job = await prisma.exportJob.findFirst({ where: { id: jobId, projectId: id } });
    if (!job) throw notFound("Export job not found");

    if (job.status === "DONE" || job.status === "FAILED") {
      return NextResponse.json({ cancelled: false, status: job.status });
    }

    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: CANCELLED_MESSAGE,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ cancelled: true, status: "FAILED" });
  } catch (error) {
    return handleRouteError(error);
  }
}
