import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { renderProjectExport } from "@/lib/editor/export-render";
import { z } from "zod";
import { saveTimelineBodySchema } from "@/lib/validations/timeline";
import { syncTrackClipIds } from "@/lib/timeline/parse";
import type { TimelineDocument } from "@/lib/timeline/types";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  resolution: z.enum([
    "1080x1920",
    "720x1280",
    "1920x1080",
    "1280x720",
    "1080x1080",
    "1080x1350",
  ]).default("1080x1920"),
  aspectRatio: z.string().default("9:16"),
  format: z.enum(["mp4", "webm"]).default("mp4"),
  subtitleBurnIn: z.boolean().optional(),
  fps: z.number().optional(),
  timeline: saveTimelineBodySchema.omit({ isAutosave: true, bumpVersion: true }).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    let body: z.infer<typeof bodySchema> = {
      resolution: "1080x1920",
      aspectRatio: "9:16",
      format: "mp4",
      subtitleBurnIn: true,
    };
    let timelineSnapshot: TimelineDocument | undefined;
    try {
      const raw = await request.json();
      const parsed = bodySchema.parse(raw);
      body = {
        resolution: parsed.resolution,
        aspectRatio: parsed.aspectRatio,
        format: parsed.format,
        subtitleBurnIn: parsed.subtitleBurnIn ?? true,
        fps: parsed.fps,
      };
      timelineSnapshot = parsed.timeline
        ? syncTrackClipIds({
            tracks: parsed.timeline.tracks,
            clips: parsed.timeline.clips,
            transitions: parsed.timeline.transitions,
            textLayers: parsed.timeline.textLayers,
            settings: {
              ...parsed.timeline.settings,
              backgroundColor: parsed.timeline.settings.backgroundColor ?? "#000000",
            },
          })
        : undefined;
    } catch (err) {
      console.warn(
        "[export] Request body failed validation — falling back to default settings and DB timeline:",
        err instanceof z.ZodError ? err.issues : err
      );
    }

    const job = await prisma.exportJob.create({
      data: {
        projectId: id,
        status: "RENDERING",
        resolution: body.resolution,
        aspectRatio: body.aspectRatio,
        subtitleBurnIn: body.subtitleBurnIn ?? true,
        renderProgress: 0,
        startedAt: new Date(),
      },
    });

    void (async () => {
      let lastReported = -1;
      // Serialize progress writes so a stale RENDERING update can never land
      // after (and overwrite) the terminal DONE/FAILED update.
      let updateQueue: Promise<unknown> = Promise.resolve();
      const reportProgress = (pct: number) => {
        const rounded = Math.min(100, Math.max(0, Math.round(pct)));
        if (rounded === lastReported) return;
        lastReported = rounded;
        updateQueue = updateQueue.then(() =>
          prisma.exportJob
            .updateMany({
              where: { id: job.id, status: "RENDERING" },
              data: { renderProgress: rounded },
            })
            .catch(() => undefined)
        );
      };

      try {
        reportProgress(1);
        const result = await renderProjectExport({
          projectId: id,
          jobId: job.id,
          resolution: body.resolution,
          format: body.format,
          subtitleBurnIn: body.subtitleBurnIn ?? true,
          fps: body.fps,
          timelineDoc: timelineSnapshot,
          onProgress: reportProgress,
        });

        await updateQueue;
        // updateMany + status guard: if the user cancelled mid-render (DELETE
        // on the [jobId] route marks it FAILED), this must not resurrect the
        // job as DONE and hand back a download.
        await prisma.exportJob.updateMany({
          where: { id: job.id, status: "RENDERING" },
          data: {
            status: "DONE",
            renderProgress: 100,
            r2Key: result.localPath,
            downloadUrl: result.downloadUrl,
            fileSizeBytes: result.fileSizeBytes,
            completedAt: new Date(),
          },
        });
      } catch (e) {
        await updateQueue.catch(() => undefined);
        await prisma.exportJob.updateMany({
          where: { id: job.id, status: "RENDERING" },
          data: {
            status: "FAILED",
            errorMessage: e instanceof Error ? e.message : "Render failed",
            completedAt: new Date(),
          },
        });
      }
    })();

    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        renderProgress: 0,
        downloadUrl: null,
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

    const jobs = await prisma.exportJob.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    return handleRouteError(error);
  }
}
