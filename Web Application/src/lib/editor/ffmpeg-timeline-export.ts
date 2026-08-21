import fs from "fs";
import path from "path";
import crypto from "crypto";
import { runFfmpeg, pickVideoEncoder, videoEncodeArgs, type VideoEncoder } from "@/lib/editor/ffmpeg";
import { cuesToAss, titleClipsToAss, type TitleCardForAss } from "@/lib/subtitles/ass-export";
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

/**
 * Map our transition types onto ffmpeg `xfade` transitions, chosen to match
 * what the editor preview draws (src/lib/editor-v2/transition-style.ts) as
 * closely as xfade allows.
 *
 * `wipe` and `flip` previously fell through to the `default` and silently
 * exported as a plain fade, so the exported video did not match the preview
 * for two of the six transitions the UI offers.
 */
function xfadeTransitionName(type: TimelineTransition["type"]): string {
  switch (type) {
    case "slide":
      // Preview slides both clips leftwards (outgoing -100%, incoming +100%→0).
      return "slideleft";
    case "wipe":
      // Preview reveals the incoming clip left→right.
      return "wiperight";
    case "zoom":
      return "zoomin";
    case "flip":
      // xfade has no 3D flip; the preview's flip passes through an edge-on
      // (black) midpoint, which fadeblack reproduces most closely.
      return "fadeblack";
    case "blur":
      return "fadeblack";
    case "push":
      return "wiperight";
    case "fade":
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
  encoder: VideoEncoder,
): Promise<number> {
  const durSec = Math.max(0.04, (clip.endTime - clip.startTime) / 1000);
  const trimSec = Math.max(0, (clip.trimStart ?? 0) / 1000);
  const fit = ((clip.properties?.fit as string) ?? "cover") as "cover" | "contain" | "fill";
  const vf = `${scalePadFilter(outW, outH, fit)},fps=${fps},format=yuv420p`;
  const encodeArgs = videoEncodeArgs(encoder, { fast: true });

  if (isImagePath(src)) {
    await runFfmpeg([
      "-loop", "1",
      "-i", src,
      "-t", durSec.toFixed(3),
      "-vf", vf,
      ...encodeArgs,
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
      ...encodeArgs,
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

/**
 * Joins the rendered clip segments, applying `xfade` ONLY at boundaries that
 * actually have a transition. Boundaries without one are hard cuts.
 *
 * This used to xfade every boundary unconditionally, falling back to a 500 ms
 * fade whenever `transitionBetween` found nothing — so a project with a single
 * transition got a half-second cross-fade on every other cut too, and the
 * exported video came out shorter than the timeline by 0.5 s per cut. Hard-cut
 * boundaries are now concatenated (stream copy, no re-encode) into chunks, and
 * only the chunk boundaries go through xfade.
 *
 * The `offset = chunkEnd - duration` math matches the editor's overlap model
 * exactly (see lib/editor-v2/transition-runtime.ts): a transition occupies the
 * last `duration` seconds of the outgoing clip, and the incoming clip starts
 * there — which is also how the timeline stores it after the ripple, so the
 * exported duration equals the timeline duration.
 */
async function joinSegments(
  segmentPaths: string[],
  segmentDurations: number[],
  transitions: TimelineTransition[],
  clipIds: string[],
  outPath: string,
  encoder: VideoEncoder,
  tmp: (name: string) => string,
): Promise<void> {
  if (segmentPaths.length === 1) {
    fs.copyFileSync(segmentPaths[0], outPath);
    return;
  }

  // Group runs of hard-cut segments into chunks; each gap between chunks is a
  // real transition.
  const chunks: { paths: string[]; duration: number }[] = [];
  const boundaries: TimelineTransition[] = [];
  let current: { paths: string[]; duration: number } = { paths: [], duration: 0 };

  for (let i = 0; i < segmentPaths.length; i++) {
    current.paths.push(segmentPaths[i]);
    current.duration += segmentDurations[i] ?? 0;
    const tr = i < segmentPaths.length - 1 ? transitionBetween(transitions, clipIds[i], clipIds[i + 1]) : undefined;
    if (tr) {
      chunks.push(current);
      boundaries.push(tr);
      current = { paths: [], duration: 0 };
    }
  }
  chunks.push(current);

  if (chunks.length === 1) {
    await concatSegments(chunks[0].paths, outPath);
    return;
  }

  // Flatten each chunk to a single file so the xfade graph has one input per
  // chunk (stream copy — the segments already share codec/params).
  const chunkPaths: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].paths.length === 1) {
      chunkPaths.push(chunks[i].paths[0]);
      continue;
    }
    const chunkPath = tmp(`chunk-${i}.mp4`);
    await concatSegments(chunks[i].paths, chunkPath);
    chunkPaths.push(chunkPath);
  }

  const args: string[] = [];
  for (const chunk of chunkPaths) args.push("-i", chunk);

  const filters: string[] = [];
  let lastLabel = "0:v";
  let timelineOffset = chunks[0].duration;

  for (let i = 0; i < chunkPaths.length - 1; i++) {
    const tr = boundaries[i];
    const transSec = Math.max(0.1, tr.durationMs / 1000);
    const transName = xfadeTransitionName(tr.type);
    const offset = Math.max(0, timelineOffset - transSec);
    const outLabel = i === chunkPaths.length - 2 ? "vout" : `v${i}`;

    filters.push(
      `[${lastLabel}][${i + 1}:v]xfade=transition=${transName}:duration=${transSec.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`,
    );

    lastLabel = outLabel;
    timelineOffset = offset + chunks[i + 1].duration;
  }

  await runFfmpeg([
    ...args,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    ...videoEncodeArgs(encoder),
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

  // Unique per invocation so two concurrent exports of the same project
  // never read/write each other's intermediate files in the shared tempDir.
  const runId = crypto.randomUUID().slice(0, 8);
  const tmp = (name: string) => path.join(tempDir, `export-${runId}-${name}`);

  const encoder = await pickVideoEncoder();

  const clips = visualClips(doc, mediaPathById, projectId);
  onProgress(10);

  const segmentPaths: string[] = [];
  const segmentDurations: number[] = [];
  const clipIds: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const src = clipMediaPath(clip, mediaPathById, projectId)!;
    const segPath = tmp(`seg-${i}.mp4`);
    const dur = await extractClipSegment(clip, src, outW, outH, fps, segPath, encoder);
    segmentPaths.push(segPath);
    segmentDurations.push(dur);
    clipIds.push(clip.id);

    // Insert black gap if the next clip starts later on the timeline
    const next = clips[i + 1];
    if (next) {
      const gapMs = next.startTime - clip.endTime;
      const hasTransition = Boolean(transitionBetween(doc.transitions, clip.id, next.id));
      if (gapMs > 50 && !hasTransition) {
        const gapPath = tmp(`gap-${i}.mp4`);
        const gapSec = gapMs / 1000;
        await runFfmpeg([
          "-f", "lavfi",
          "-i", `color=c=#000000:s=${outW}x${outH}:r=${fps}:d=${gapSec.toFixed(3)}`,
          ...videoEncodeArgs(encoder, { fast: true }),
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

  const videoOnly = tmp("video.mp4");

  if (segmentPaths.length === 0) {
    const blankDur = Math.max(1, doc.settings.durationMs / 1000);
    await runFfmpeg([
      "-f", "lavfi",
      "-i", `color=c=#000000:s=${outW}x${outH}:r=${fps}:d=${blankDur.toFixed(2)}`,
      ...videoEncodeArgs(encoder),
      "-pix_fmt", "yuv420p",
      videoOnly,
    ]);
  } else if (doc.transitions.length > 0 && segmentPaths.length > 1) {
    await joinSegments(segmentPaths, segmentDurations, doc.transitions, clipIds, videoOnly, encoder, tmp);
  } else {
    await concatSegments(segmentPaths, videoOnly);
  }

  onProgress(65);

  let outputPath = tmp("with-audio.mp4");
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
    const assPath = tmp("subs.ass");
    fs.writeFileSync(assPath, cuesToAss(subtitleCues, subtitleStyle, outW, outH), "utf-8");
    const burned = tmp("burned.mp4");
    await runFfmpeg([
      "-i", outputPath,
      "-vf", `ass='${toSubtitleFilterFilename(assPath)}'`,
      ...videoEncodeArgs(encoder),
      "-c:a", "copy",
      burned,
    ]);
    outputPath = burned;
  }

  const textClips = Object.values(doc.clips).filter((c) => c.type === "text" && c.properties?.text);
  if (textClips.length > 0) {
    const authoredW = doc.settings.width || outW;
    const authoredH = doc.settings.height || outH;
    const titleCards: TitleCardForAss[] = textClips.map((tc) => {
      const props = tc.properties ?? {};
      const style = (props.style as Record<string, unknown>) ?? {};
      const pos = props.position as { x?: number; y?: number } | undefined;
      const size = props.size as { width?: number; height?: number } | undefined;
      return {
        text: String(props.text ?? ""),
        startMs: tc.startTime,
        endMs: tc.endTime,
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
        w: size?.width ?? authoredW,
        h: size?.height ?? authoredH * 0.1,
        fontFamily: style.fontFamily as string | undefined,
        fontSize: style.fontSize as number | undefined,
        fontWeight: style.fontWeight as number | undefined,
        color: style.color as string | undefined,
        italic: style.italic as boolean | undefined,
        underline: style.underline as boolean | undefined,
        backgroundColor: style.backgroundColor as string | undefined,
        stroke: style.stroke as boolean | undefined,
        strokeColor: style.strokeColor as string | undefined,
        strokeWidth: style.strokeWidth as number | undefined,
      };
    });
    const titleAssPath = tmp("titles.ass");
    fs.writeFileSync(titleAssPath, titleClipsToAss(titleCards, authoredW, authoredH, outW, outH), "utf-8");
    const overlayed = tmp("overlayed.mp4");
    await runFfmpeg([
      "-i", outputPath,
      "-vf", `ass='${toSubtitleFilterFilename(titleAssPath)}'`,
      ...videoEncodeArgs(encoder),
      "-c:a", "copy",
      overlayed,
    ]);
    outputPath = overlayed;
  }

  onProgress(88);

  const format = options.format ?? "mp4";
  if (format === "webm") {
    const webmPath = tmp("output.webm");
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
