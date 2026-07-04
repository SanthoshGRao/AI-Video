import fs from "fs";
import path from "path";
import { runFfmpeg } from "@/lib/editor/ffmpeg";
import { cuesToAss } from "@/lib/subtitles/ass-export";
import { resolveSubtitleStyle } from "@/lib/subtitles/presets";
import type { SubtitleCue, SubtitleStyle } from "@/lib/subtitles/types";
import type { TimelineClip, TimelineDocument, TimelineTransition } from "@/lib/timeline/types";
import {
  assertInsideStorage,
  filePath,
  parseStorageKey,
  projectDir,
  StorageCategory,
} from "@/lib/storage/paths";
import { saveBufferAsync } from "@/lib/storage/local";

function formatSrtTimestamp(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function toSubtitleFilterFilename(filePathArg: string): string {
  const relativePath = path.relative(process.cwd(), path.resolve(filePathArg));
  return relativePath.replace(/\\/g, "/").replace(/'/g, "\\'");
}

export function resolveMediaFilePath(
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

function clipMediaPath(
  clip: TimelineClip,
  mediaPathById: Map<string, string>,
  projectId: string,
): string | null {
  if (clip.mediaAssetId) {
    const p = mediaPathById.get(clip.mediaAssetId);
    if (p && fs.existsSync(p)) return p;
  }
  const src = (clip.properties as { src?: string } | undefined)?.src;
  if (!src) return null;
  if (fs.existsSync(src)) return src;

  // Resolve /api/storage/media/{projectId}/{fileName} to local disk path
  const storageMatch = src.match(/\/api\/storage\/(media|audio)\/([^/]+)\/([^/?#]+)/);
  if (storageMatch) {
    const category = storageMatch[1] === "audio" ? StorageCategory.AUDIO : StorageCategory.MEDIA;
    const local = filePath(category, storageMatch[2], decodeURIComponent(storageMatch[3]));
    if (fs.existsSync(local)) return local;
  }

  if (src.startsWith("http://") || src.startsWith("https://")) {
    const fileName = path.basename(new URL(src).pathname);
    const local = filePath(StorageCategory.MEDIA, projectId, fileName);
    if (fs.existsSync(local)) return local;
  }

  return null;
}

function isImagePath(p: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(p);
}

function scalePadFilter(w: number, h: number, fit: "cover" | "contain" | "fill" = "cover"): string {
  if (fit === "contain") {
    return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  }
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
}

function visualClips(doc: TimelineDocument, mediaPathById: Map<string, string>, projectId: string): TimelineClip[] {
  const fromTracks: TimelineClip[] = [];
  const seen = new Set<string>();

  for (const track of doc.tracks) {
    if (track.type !== "video") continue;
    for (const clipId of track.clipIds) {
      if (seen.has(clipId)) continue;
      const clip = doc.clips[clipId];
      if (!clip || (clip.type !== "video" && clip.type !== "image")) continue;
      if (!clipMediaPath(clip, mediaPathById, projectId)) continue;
      seen.add(clipId);
      fromTracks.push(clip);
    }
  }

  if (fromTracks.length > 0) {
    return fromTracks.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  }

  return Object.values(doc.clips)
    .filter((c) => (c.type === "video" || c.type === "image") && clipMediaPath(c, mediaPathById, projectId))
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
}

function transitionBetween(
  transitions: TimelineTransition[],
  clipAId: string,
  clipBId: string,
): TimelineTransition | undefined {
  return transitions.find((t) => t.clipAId === clipAId && t.clipBId === clipBId);
}

function xfadeTransitionName(type: TimelineTransition["type"]): string {
  switch (type) {
    case "slide":
      return "slideleft";
    case "zoom":
      return "zoomin";
    case "blur":
      return "fadeblack";
    case "push":
      return "wiperight";
    default:
      return "fade";
  }
}

async function extractClipSegment(
  clip: TimelineClip,
  src: string,
  outW: number,
  outH: number,
  fps: number,
  outPath: string,
): Promise<number> {
  const durSec = Math.max(0.04, (clip.endTime - clip.startTime) / 1000);
  const trimSec = Math.max(0, (clip.trimStart ?? 0) / 1000);
  const fit = ((clip.properties?.fit as string) ?? "cover") as "cover" | "contain" | "fill";
  const vf = `${scalePadFilter(outW, outH, fit)},fps=${fps},format=yuv420p`;

  if (isImagePath(src)) {
    await runFfmpeg([
      "-loop", "1",
      "-i", src,
      "-t", durSec.toFixed(3),
      "-vf", vf,
      "-c:v", "libx264",
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-an",
      outPath,
    ]);
  } else {
    await runFfmpeg([
      "-ss", trimSec.toFixed(3),
      "-i", src,
      "-t", durSec.toFixed(3),
      "-vf", vf,
      "-c:v", "libx264",
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-an",
      outPath,
    ]);
  }

  return durSec;
}

async function concatSegments(segmentPaths: string[], outPath: string): Promise<void> {
  const listFile = `${outPath}.txt`;
  fs.writeFileSync(
    listFile,
    segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  await runFfmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outPath]);
}

async function xfadeSegments(
  segmentPaths: string[],
  segmentDurations: number[],
  transitions: TimelineTransition[],
  clipIds: string[],
  outPath: string,
): Promise<void> {
  if (segmentPaths.length === 1) {
    fs.copyFileSync(segmentPaths[0], outPath);
    return;
  }

  const args: string[] = [];
  for (const seg of segmentPaths) {
    args.push("-i", seg);
  }

  const filters: string[] = [];
  let lastLabel = "0:v";
  let timelineOffset = segmentDurations[0] ?? 0;

  for (let i = 0; i < segmentPaths.length - 1; i++) {
    const tr = transitionBetween(transitions, clipIds[i], clipIds[i + 1]);
    const transSec = Math.max(0.1, (tr?.durationMs ?? 500) / 1000);
    const transName = xfadeTransitionName(tr?.type ?? "fade");
    const offset = Math.max(0, timelineOffset - transSec);
    const outLabel = i === segmentPaths.length - 2 ? "vout" : `v${i}`;

    filters.push(
      `[${lastLabel}][${i + 1}:v]xfade=transition=${transName}:duration=${transSec.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`,
    );

    lastLabel = outLabel;
    timelineOffset = offset + (segmentDurations[i + 1] ?? 0);
  }

  await runFfmpeg([
    ...args,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    outPath,
  ]);
}

export async function renderTimelineWithFfmpeg(options: {
  projectId: string;
  doc: TimelineDocument;
  resolution: string;
  format?: "mp4" | "webm";
  subtitleBurnIn: boolean;
  subtitleCues: SubtitleCue[];
  subtitleStyle: SubtitleStyle;
  audioPath: string | null;
  mediaPathById: Map<string, string>;
  onProgress: (pct: number) => void;
}): Promise<{ downloadUrl: string; fileSizeBytes: number; localPath: string }> {
  const {
    projectId,
    doc,
    resolution,
    subtitleBurnIn,
    subtitleCues,
    subtitleStyle,
    audioPath,
    mediaPathById,
    onProgress,
  } = options;

  const [outW, outH] = resolution.split("x").map(Number);
  const fps = doc.settings.fps || 30;
  const tempDir = projectDir(StorageCategory.TEMP, projectId);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const clips = visualClips(doc, mediaPathById, projectId);
  onProgress(10);

  const segmentPaths: string[] = [];
  const segmentDurations: number[] = [];
  const clipIds: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const src = clipMediaPath(clip, mediaPathById, projectId)!;
    const segPath = path.join(tempDir, `export-seg-${i}.mp4`);
    const dur = await extractClipSegment(clip, src, outW, outH, fps, segPath);
    segmentPaths.push(segPath);
    segmentDurations.push(dur);
    clipIds.push(clip.id);

    // Insert black gap if the next clip starts later on the timeline
    const next = clips[i + 1];
    if (next) {
      const gapMs = next.startTime - clip.endTime;
      const hasTransition = Boolean(transitionBetween(doc.transitions, clip.id, next.id));
      if (gapMs > 50 && !hasTransition) {
        const gapPath = path.join(tempDir, `export-gap-${i}.mp4`);
        const gapSec = gapMs / 1000;
        await runFfmpeg([
          "-f", "lavfi",
          "-i", `color=c=#000000:s=${outW}x${outH}:r=${fps}:d=${gapSec.toFixed(3)}`,
          "-c:v", "libx264",
          "-preset", "fast",
          "-pix_fmt", "yuv420p",
          gapPath,
        ]);
        segmentPaths.push(gapPath);
        segmentDurations.push(gapSec);
        clipIds.push(`gap-${i}`);
      }
    }

    onProgress(10 + Math.round(((i + 1) / Math.max(clips.length, 1)) * 45));
  }

  const videoOnly = path.join(tempDir, "export-video.mp4");

  if (segmentPaths.length === 0) {
    const blankDur = Math.max(1, doc.settings.durationMs / 1000);
    await runFfmpeg([
      "-f", "lavfi",
      "-i", `color=c=#000000:s=${outW}x${outH}:r=${fps}:d=${blankDur.toFixed(2)}`,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      videoOnly,
    ]);
  } else if (doc.transitions.length > 0 && segmentPaths.length > 1) {
    await xfadeSegments(segmentPaths, segmentDurations, doc.transitions, clipIds, videoOnly);
  } else {
    await concatSegments(segmentPaths, videoOnly);
  }

  onProgress(65);

  let outputPath = path.join(tempDir, "export-with-audio.mp4");
  if (audioPath && fs.existsSync(audioPath)) {
    await runFfmpeg([
      "-i", videoOnly,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      outputPath,
    ]);
  } else {
    fs.copyFileSync(videoOnly, outputPath);
  }

  onProgress(75);

  if (subtitleBurnIn && subtitleCues.length > 0) {
    const assPath = path.join(tempDir, "export-subs.ass");
    fs.writeFileSync(assPath, cuesToAss(subtitleCues, subtitleStyle, outW, outH), "utf-8");
    const burned = path.join(tempDir, "export-burned.mp4");
    await runFfmpeg([
      "-i", outputPath,
      "-vf", `ass='${toSubtitleFilterFilename(assPath)}'`,
      "-c:a", "copy",
      burned,
    ]);
    outputPath = burned;
  }

  const textClips = Object.values(doc.clips).filter((c) => c.type === "text" && c.properties?.text);
  if (textClips.length > 0) {
    const overlaySrtPath = path.join(tempDir, "export-overlays.srt");
    const overlayLines: string[] = [];
    textClips.forEach((tc, i) => {
      overlayLines.push(`${i + 1}`);
      overlayLines.push(`${formatSrtTimestamp(tc.startTime)} --> ${formatSrtTimestamp(tc.endTime)}`);
      overlayLines.push(String(tc.properties?.text ?? "").replace(/\n/g, " "));
      overlayLines.push("");
    });
    fs.writeFileSync(overlaySrtPath, overlayLines.join("\n"), "utf-8");
    const overlayed = path.join(tempDir, "export-overlayed.mp4");
    await runFfmpeg([
      "-i", outputPath,
      "-vf", `subtitles=filename='${toSubtitleFilterFilename(overlaySrtPath)}'`,
      "-c:a", "copy",
      overlayed,
    ]);
    outputPath = overlayed;
  }

  onProgress(88);

  const format = options.format ?? "mp4";
  if (format === "webm") {
    const webmPath = path.join(tempDir, "export-output.webm");
    await runFfmpeg([
      "-i", outputPath,
      "-c:v", "libvpx-vp9",
      "-b:v", "0",
      "-crf", "32",
      "-c:a", "libopus",
      webmPath,
    ]);
    outputPath = webmPath;
  }

  onProgress(95);

  const buffer = fs.readFileSync(outputPath);
  const fileName = `export-${Date.now()}.${format}`;
  const saved = await saveBufferAsync(StorageCategory.EXPORTS, projectId, fileName, buffer);

  onProgress(100);

  console.log(`[export] FFmpeg timeline export complete (${clips.length} clip(s), ${resolution})`);

  return {
    downloadUrl: saved.url,
    fileSizeBytes: saved.sizeBytes,
    localPath: saved.localPath,
  };
}
