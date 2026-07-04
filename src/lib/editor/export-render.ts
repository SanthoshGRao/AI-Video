import fs from "fs";
import path from "path";
import prisma from "@/lib/db/prisma";
import { parseCuesJson } from "@/lib/subtitles/cues";
import { parseTimelineRow } from "@/lib/timeline/parse";
import { resolveSubtitleStyle } from "@/lib/subtitles/presets";
import type { SubtitleStyle } from "@/lib/subtitles/types";
import type { TimelineDocument } from "@/lib/timeline/types";
import { getSubtitlesFromTimeline } from "@/lib/editor/timeline-adapter";
import {
  assertInsideStorage,
  filePath,
  parseStorageKey,
  StorageCategory,
} from "@/lib/storage/paths";

function resolveFilePath(
  localPath: string | null | undefined,
  r2Key: string | null | undefined,
  projectId: string,
  category: (typeof StorageCategory)[keyof typeof StorageCategory],
  originalName?: string | null,
): string | null {
  if (localPath && fs.existsSync(localPath)) {
    assertInsideStorage(localPath);
    return localPath;
  }
  if (r2Key) {
    const parsed = parseStorageKey(r2Key);
    if (parsed) {
      const p = filePath(parsed.category, parsed.projectId, parsed.fileName);
      if (fs.existsSync(p)) return p;
    }
  }
  if (originalName && category) {
    const p = filePath(category, projectId, originalName);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveMediaPathForExport(
  localPath: string | null | undefined,
  r2Key: string | null | undefined,
  r2Url: string | null | undefined,
  projectId: string,
  originalName?: string | null,
): string | null {
  const fromStorage = resolveFilePath(localPath, r2Key, projectId, StorageCategory.MEDIA, originalName);
  if (fromStorage) return fromStorage;

  if (r2Url?.startsWith("/api/storage/")) {
    const match = r2Url.match(/\/api\/storage\/media\/([^/]+)\/([^/?#]+)/);
    if (match) {
      const p = filePath(StorageCategory.MEDIA, match[1], decodeURIComponent(match[2]));
      if (fs.existsSync(p)) return p;
    }
  }

  if (r2Url && !r2Url.startsWith("http") && fs.existsSync(r2Url)) {
    assertInsideStorage(r2Url);
    return r2Url;
  }

  return null;
}

export async function renderProjectExport(options: {
  projectId: string;
  jobId: string;
  resolution:
    | "1080x1920"
    | "720x1280"
    | "1920x1080"
    | "1280x720"
    | "1080x1080"
    | "1080x1350";
  format?: "mp4" | "webm";
  subtitleBurnIn: boolean;
  fps?: number;
  /** Live editor snapshot — takes priority over DB timeline when provided. */
  timelineDoc?: TimelineDocument;
  onProgress: (pct: number) => void;
}): Promise<{ downloadUrl: string; fileSizeBytes: number; localPath: string }> {
  const { projectId, resolution, subtitleBurnIn, onProgress, timelineDoc } = options;

  onProgress(2);

  // Remotion canvas export is used by default to ensure all visual overlays, text, shapes,
  // and stickers are rendered. It can be disabled via REMOTION_EXPORT=false.
  const remotionEnabled =
    process.env.REMOTION_EXPORT !== "false" && process.env.REMOTION_EXPORT !== "0";

  if (remotionEnabled) {
    try {
      const { renderProjectWithRemotion } = await import("./render-with-remotion");
      const result = await renderProjectWithRemotion({
        projectId,
        resolution,
        format: options.format ?? "mp4",
        fps: options.fps,
        timelineDoc,
        onProgress,
      });
      if (result) return result;
      console.warn("[export] Remotion export unavailable — falling back to FFmpeg pipeline");
    } catch (err) {
      console.error("[export] Remotion export failed — falling back to FFmpeg pipeline:", err);
    }
  }

  onProgress(5);

  let doc: TimelineDocument;
  if (timelineDoc && Object.keys(timelineDoc.clips).length > 0) {
    doc = timelineDoc;
    console.log(`[export] Using live editor snapshot (${Object.keys(doc.clips).length} clips)`);
  } else {
    const timeline = await prisma.timeline.findFirst({
      where: { projectId },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ],
    });
    if (!timeline) throw new Error("No timeline saved — open Editor and save first");
    doc = parseTimelineRow(timeline);
    console.log(`[export] Using DB timeline (${Object.keys(doc.clips).length} clips)`);
  }

  const audio = await prisma.audioAsset.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const subtitle = await prisma.subtitleTrack.findFirst({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
  });

  const originalCues = subtitle ? parseCuesJson(subtitle.cues) : [];
  const { cues: subtitleCues, style: timelineStyle } = getSubtitlesFromTimeline(doc, originalCues);

  const mediaRows = await prisma.mediaAsset.findMany({ where: { projectId } });
  const mediaPathById = new Map<string, string>();
  for (const m of mediaRows) {
    const resolved = resolveMediaPathForExport(
      m.localPath,
      m.r2Key,
      m.r2Url,
      projectId,
      m.originalName,
    );
    if (resolved) mediaPathById.set(m.id, resolved);
  }

  const audioPath = audio
    ? resolveFilePath(audio.localPath, audio.r2Key, projectId, StorageCategory.AUDIO)
    : null;

  const subtitleStyle = resolveSubtitleStyle(
    subtitle?.stylePreset || "instagram_reels",
    (timelineStyle || subtitle?.customStyle) as SubtitleStyle | null,
  );

  const { renderTimelineWithFfmpeg } = await import("./ffmpeg-timeline-export");
  return renderTimelineWithFfmpeg({
    projectId,
    doc,
    resolution,
    format: options.format ?? "mp4",
    subtitleBurnIn,
    subtitleCues,
    subtitleStyle,
    audioPath,
    mediaPathById,
    onProgress,
  });
}
