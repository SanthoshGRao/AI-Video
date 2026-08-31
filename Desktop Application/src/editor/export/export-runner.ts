/**
 * export-runner.ts — drives the native GPU-compositor export pipeline:
 *
 *   timeline-evaluator (resolveFrameAt, per output frame)
 *     -> decode-pipeline (FFmpeg, one persistent decoder per active clip)
 *     -> render-window (hidden BrowserWindow running gpu-compositor)
 *     -> encode-pipeline (FFmpeg, raw frames in via stdin, hw encoder out)
 *
 * plus two FFmpeg side-passes that reuse existing, proven logic rather than
 * duplicating it: audio-mix.ts (filtergraph-builder.ts's audio graph,
 * mapped without any video) and an ASS burn-in pass for text clips/
 * subtitles (gpu-compositor doesn't render text yet — see subtitles.ts's
 * buildTitleAssFile doc comment).
 *
 * Replaces the single filtergraph-builder.ts `-filter_complex` process
 * that used to do all video compositing in FFmpeg itself.
 */

import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { getCapabilities } from "./ffmpeg-locate";
import type { ResolvedMediaPath } from "./filtergraph-builder";
import {
  buildAssFile,
  buildTitleAssFile,
  writeAssFile,
  type SubtitleCue,
  type SubtitleStyle,
  type TitleClipForAss,
} from "./subtitles";
import { RESOLUTION_HEIGHTS, type ExportOptions } from "./export-types";
import { getMediaAssetsByIds } from "../data/media-assets.repo";
import { getAudioAssetsByIds } from "../data/audio-assets.repo";
import { resolveAssetPath } from "../data/asset-cache";
import { getSubtitleTrack } from "../data/subtitle-tracks.repo";
import { probeMedia } from "../media/probe";
import { completeExportJob, failExportJob, updateExportProgress } from "../data/export-jobs.repo";
import { logger, timer } from "../diagnostics/logger";
import { classifyExportError } from "../diagnostics/export-error-taxonomy";
import { storagePath } from "../../config";
import { resolveFrameAt } from "./timeline-evaluator";
import { openRenderWindow, type RenderWindowHandle, type RenderWireEffect, type RenderWireLayer } from "./render-window";
import { DecodePipeline, readImageClipFrame } from "./decode-pipeline";
import { StageTimings } from "./stage-timings";
import { EncodePipeline } from "./encode-pipeline";
import { mixProjectAudio } from "./audio-mix";
import type { EffectInstance, NativeClip } from "../model/types";

const ASPECT_RATIOS: Record<string, number> = {
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "1:1": 1,
  "4:5": 4 / 5,
};

function evenify(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

/**
 * Resolves the export canvas from the UI's resolution label + aspect ratio.
 *
 * A resolution label names the **short side**, not the height: "1080p" on a
 * 9:16 project means 1080x1920, the same way it means 1920x1080 on a 16:9
 * one. Treating it as the height (which this used to do) silently exported
 * every portrait project at 608x1080 — a quarter of the requested pixels.
 *
 * Explicit "WIDTHxHEIGHT" labels are honoured verbatim, because that is what
 * the current editor UI actually sends; they previously matched nothing in
 * RESOLUTION_HEIGHTS and fell through to the 1920 default, so a user asking
 * for 720x1280 got a 1080x1920 file.
 */
function canvasSizeFor(resolution: string, aspectRatio: string): { width: number; height: number } {
  const explicit = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(resolution.trim());
  if (explicit) {
    return { width: evenify(Number(explicit[1])), height: evenify(Number(explicit[2])) };
  }

  const shortSide = RESOLUTION_HEIGHTS[resolution] ?? 1080;
  const ratio = ASPECT_RATIOS[aspectRatio] ?? 9 / 16;
  const [width, height] = ratio >= 1 ? [shortSide * ratio, shortSide] : [shortSide, shortSide / ratio];
  return { width: evenify(width), height: evenify(height) };
}

function exportOutputPath(projectId: string, format: string): { path: string; fileName: string } {
  const dir = path.join(storagePath(), "exports", projectId);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `export-${Date.now()}.${format}`;
  return { path: path.join(dir, fileName), fileName };
}

/** See export-runner.ts's docstring in the (now-inactive) filtergraph
 * path — same download URL contract, so the existing editor-v2 polling/
 * download code works unchanged against this engine's output too. */
function exportDownloadUrl(projectId: string, fileName: string): string {
  return `/api/storage/exports/${projectId}/${encodeURIComponent(fileName)}`;
}

function runSimpleFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-y", ...args], { windowsHide: true });
    let stderrTail = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else if (signal) reject(new Error("Export cancelled"));
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderrTail.slice(-800)}`));
    });
  });
}

function mapEffectToWire(effect: EffectInstance): RenderWireEffect {
  switch (effect.type) {
    case "brightness":
    case "contrast":
    case "saturation":
    case "hueRotate":
      return { type: effect.type, amount: effect.amount };
    case "blur":
      return { type: "blur", radiusPx: effect.radiusPx };
    case "chromaKey":
      return { type: "chromaKey", color: effect.color, tolerance: effect.tolerance };
    case "vignette":
      return { type: "vignette", strength: effect.strength };
    case "glow":
      return { type: "glow", strength: effect.strength };
    case "preset":
      return { type: "preset", id: effect.id };
    case "lut":
      // Not yet implemented (needs LUT asset resolution) — matches the
      // pre-existing filtergraph-builder.ts limitation, logged not silent.
      logger.warn("export", "LUT effect not yet supported by the GPU compositor path — skipped", {
        assetId: effect.assetId,
      });
      return { type: "preset", id: "none" };
    default:
      return { type: "preset", id: "none" };
  }
}

/**
 * Burns in text clips and/or subtitle cues as sequential ASS overlay passes
 * on the already-composited (silent-of-text) video. Returns the input path
 * unchanged if there's nothing to burn in.
 */
async function burnInText(
  ffmpegPath: string,
  inputPath: string,
  tempDir: string,
  jobId: string,
  textClips: NativeClip[],
  subtitleCues: SubtitleCue[],
  subtitleStyle: SubtitleStyle,
  width: number,
  height: number,
  tempFiles: string[],
  projectWidth: number,
  projectHeight: number,
): Promise<string> {
  let current = inputPath;

  if (subtitleCues.length > 0) {
    const ass = buildAssFile(subtitleCues, subtitleStyle, width, height);
    const { path: assPath, filterPath } = writeAssFile(ass, `${jobId}-subs`);
    tempFiles.push(assPath);
    const out = path.join(tempDir, `subs-${jobId}.mp4`);
    await runSimpleFfmpeg(ffmpegPath, ["-i", current, "-vf", `subtitles='${filterPath}'`, "-c:a", "copy", out]);
    tempFiles.push(out);
    current = out;
  }

  if (textClips.length > 0) {
    const titles: TitleClipForAss[] = textClips.map((clip) => {
      // clip.transform.x/y/w/h are pixels against the project's authoring
      // canvas (see the matching normalization in timeline-evaluator.ts's
      // resolveFrameAt) — buildTitleAssFile() needs true 0-100 percentages.
      const t = clip.transform ?? { x: 0, y: 0, w: projectWidth, h: projectHeight * 0.2, rotationDeg: 0, opacity: 1 };
      const style = (clip.text?.style ?? {}) as Record<string, unknown>;
      return {
        text: clip.text?.content ?? "",
        startSec: clip.startSec,
        endSec: clip.endSec,
        xPct: (t.x / projectWidth) * 100,
        yPct: (t.y / projectHeight) * 100,
        wPct: (t.w / projectWidth) * 100,
        hPct: (t.h / projectHeight) * 100,
        fontFamily: style.fontFamily as string | undefined,
        fontSize: style.fontSize as number | undefined,
        color: style.color as string | undefined,
        // The editor stores CSS font weights (400/700/800...) — anything at
        // or above 600 reads as bold, matching the preview's rendering.
        bold: typeof style.fontWeight === "number" ? style.fontWeight >= 600 : style.fontWeight === "bold",
        italic: style.italic === true || style.fontStyle === "italic",
      };
    });
    const ass = buildTitleAssFile(titles, width, height);
    const { path: assPath, filterPath } = writeAssFile(ass, `${jobId}-titles`);
    tempFiles.push(assPath);
    const out = path.join(tempDir, `titles-${jobId}.mp4`);
    await runSimpleFfmpeg(ffmpegPath, ["-i", current, "-vf", `subtitles='${filterPath}'`, "-c:a", "copy", out]);
    tempFiles.push(out);
    current = out;
  }

  return current;
}

/**
 * Maps an editor `properties.src` (always a `/api/storage/...` URL, the same
 * one the web app's storage route serves) back to the file on disk.
 * `/api/storage/audio/<projectId>/<file>` <-> `<storageRoot>/audio/<projectId>/<file>`.
 */
function storageSrcToLocalPath(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const match = /^\/api\/storage\/(.+)$/.exec(src.split("?")[0]);
  if (!match) return null;
  const relative = match[1].split("/").map(decodeURIComponent);
  // Reject anything that tries to climb out of the storage root.
  if (relative.some((segment) => segment === ".." || segment === "")) return null;
  const resolved = path.join(storagePath(), ...relative);
  return fs.existsSync(resolved) ? resolved : null;
}

/**
 * Recovers `mediaAssetId` / `audioAssetId` for clips that were saved without
 * one.
 *
 * The AI generation pipeline writes voiceover/media files to disk and puts
 * only the storage URL on the clip's `properties.src`; the asset-id fields
 * are populated by the media-library import path, which those clips never
 * go through. Everything downstream of here (filtergraph-builder's input
 * resolution, decode-pipeline's source lookup) keys off the id, so such a
 * clip resolved to *nothing* and was dropped without any error — which is
 * why exports of AI-generated projects came out silently muted.
 *
 * Synthesising a stable id from the file path is enough: the id is only ever
 * used as a join key within a single export run.
 */
function backfillAssetIds(clips: NativeClip[]): number {
  let repaired = 0;
  for (const clip of clips) {
    if (clip.mediaAssetId || clip.audioAssetId) continue;
    const localPath = storageSrcToLocalPath(clip.raw?.src);
    if (!localPath) continue;
    const synthetic = `src:${localPath}`;
    if (clip.kind === "audio") clip.audioAssetId = synthetic;
    else clip.mediaAssetId = synthetic;
    repaired++;
  }
  return repaired;
}

/**
 * Which authoring scale a text clip was styled against.
 *
 * Subtitles and titles are authored on the same 300x480 studio stage but at
 * different text scales (0.55 vs 0.34) — see the web app's
 * `studio-overlay-styles.ts`. Getting this wrong resizes the text by ~1.6x,
 * so it is read from the clip's own `textOverlayMeta.category` (what the
 * editor writes) and only falls back to the track kind.
 */
function textKindOf(clip: NativeClip): "subtitle" | "title" {
  const meta = clip.raw?.textOverlayMeta as { category?: string } | undefined;
  if (meta?.category === "subtitle") return "subtitle";
  if (meta?.category === "title") return "title";
  return clip.kind === "subtitle" || clip.cueId ? "subtitle" : "title";
}

/**
 * Per-word timings, for karaoke/highlight/word_pop animations.
 *
 * `RenderWireText.timeMs` (below) is the playhead relative to the clip's OWN
 * start, so word timings must be in that same clip-relative basis to line up
 * — but the editor doesn't consistently save them that way: editor-v2 writes
 * `cue.words` straight through (absolute timeline ms, see
 * `Web Application/src/lib/editor-v2/timeline-sync.ts`), while the older
 * OpenCut subtitle builder already makes them cue-relative. Left unconverted,
 * only a clip starting at (or near) t=0 in the timeline would ever get a
 * timeMs/word match — every later subtitle cue's words compare against a
 * timeMs that never reaches their (much larger) absolute startMs, so
 * highlighting silently stops after the first cue. Detect which basis this
 * clip's words are actually in (by checking whether the first word lines up
 * with the clip's absolute start) and normalize to clip-relative.
 */
function wordsOf(clip: NativeClip): Array<{ word: string; startMs: number; endMs: number }> | undefined {
  const raw = clip.raw?.words;
  if (!Array.isArray(raw)) return undefined;
  const words = raw
    .filter((w): w is Record<string, unknown> => typeof w === "object" && w !== null)
    .map((w) => ({
      word: String(w.word ?? ""),
      startMs: Number(w.startMs ?? 0),
      endMs: Number(w.endMs ?? 0),
    }))
    .filter((w) => w.word);
  if (words.length === 0) return undefined;

  const clipStartMs = clip.startSec * 1000;
  const firstStart = words[0].startMs;
  const looksAbsolute = Math.abs(firstStart - clipStartMs) < Math.abs(firstStart);
  const offset = looksAbsolute ? clipStartMs : 0;

  return words.map((w) => ({
    word: w.word,
    startMs: w.startMs - offset,
    endMs: w.endMs - offset,
  }));
}

interface ActiveExport {
  cancelled: boolean;
  renderWindow: RenderWindowHandle | null;
  decodePipeline: DecodePipeline | null;
  encodeProcessKiller: (() => void) | null;
}

const activeExports = new Map<string, ActiveExport>();

export function cancelExport(jobId: string): boolean {
  const active = activeExports.get(jobId);
  if (!active) return false;
  active.cancelled = true;
  active.encodeProcessKiller?.();
  active.decodePipeline?.closeAll();
  active.renderWindow?.close();
  return true;
}

export async function runExport(
  jobId: string,
  options: ExportOptions,
  onProgress: (percent: number) => void,
): Promise<void> {
  const totalTimer = timer();
  const timings = new StageTimings();
  const active: ActiveExport = { cancelled: false, renderWindow: null, decodePipeline: null, encodeProcessKiller: null };
  activeExports.set(jobId, active);

  const tempDir = path.join(storagePath(), "exports", options.projectId, "tmp");
  const tempFiles: string[] = [];

  try {
    const { project } = options;
    const { width, height } = canvasSizeFor(options.resolution, options.aspectRatio);
    logger.info("export", "Export started (GPU compositor pipeline)", {
      jobId,
      projectId: options.projectId,
      format: options.format,
      resolution: options.resolution,
      clipCount: project.clips.length,
      durationSec: project.durationSec,
    });

    fs.mkdirSync(tempDir, { recursive: true });

    // Clips whose asset id was never persisted (only `properties.src`) are
    // repaired here — see backfillAssetIds()'s doc comment. Without this the
    // project's voiceover clip resolves to nothing and every export is
    // silently muted.
    const backfilled = backfillAssetIds(project.clips);
    if (backfilled > 0) {
      logger.warn("export", "Clips were missing asset ids — recovered from properties.src", {
        jobId,
        clipCount: backfilled,
      });
    }

    const mediaAssetIds = [...new Set(project.clips.map((c) => c.mediaAssetId).filter((v): v is string => !!v))];
    const audioAssetIds = [...new Set(project.clips.map((c) => c.audioAssetId).filter((v): v is string => !!v))];
    const [mediaAssets, audioAssets] = await Promise.all([
      getMediaAssetsByIds(mediaAssetIds),
      getAudioAssetsByIds(audioAssetIds),
    ]);

    // Resolve every asset to a real file on THIS machine, downloading from
    // R2 into a local cache on a miss — a workspace project's assets were
    // very possibly generated on a teammate's machine, whose `localPath`
    // means nothing here. See asset-cache.ts.
    const [resolvedMediaEntries, resolvedAudioEntries] = await Promise.all([
      Promise.all(
        mediaAssets.map(async (m) => [
          m.id,
          await resolveAssetPath(m.id, m.localPath, m.r2Url, m.originalName, m.mimeType),
        ] as const)
      ),
      Promise.all(
        audioAssets.map(async (a) => [a.id, await resolveAssetPath(a.id, a.localPath, a.r2Url)] as const)
      ),
    ]);
    const mediaPathById = new Map(
      resolvedMediaEntries.filter((e): e is [string, string] => e[1] !== null)
    );
    const audioPathById = new Map(
      resolvedAudioEntries.filter((e): e is [string, string] => e[1] !== null)
    );

    // Video clips' own embedded audio is only mixed in when the source is
    // confirmed to actually have an audio stream (see filtergraph-builder.ts)
    // — probe just the media assets a "video" clip actually references, so a
    // project with no such clips pays nothing extra.
    const videoAssetIdsNeedingAudioProbe = new Set(
      project.clips
        .filter((c) => c.kind === "video" && c.mediaAssetId && mediaPathById.has(c.mediaAssetId))
        .map((c) => c.mediaAssetId!)
    );
    const hasAudioById = new Map<string, boolean>();
    await Promise.all(
      [...videoAssetIdsNeedingAudioProbe].map(async (id) => {
        try {
          const info = await probeMedia(mediaPathById.get(id)!);
          hasAudioById.set(id, info.hasAudio);
        } catch (err) {
          logger.warn("export", "Audio-stream probe failed — treating clip as silent", { jobId, mediaAssetId: id, error: String(err) });
          hasAudioById.set(id, false);
        }
      })
    );

    const resolvedMedia: ResolvedMediaPath[] = [
      ...mediaAssets
        .filter((m) => mediaPathById.has(m.id))
        .map((m) => ({
          mediaAssetId: m.id,
          localPath: mediaPathById.get(m.id)!,
          durationMs: m.durationMs,
          hasAudio: hasAudioById.get(m.id),
        })),
      ...audioAssets
        .filter((a) => audioPathById.has(a.id))
        .map((a) => ({ audioAssetId: a.id, localPath: audioPathById.get(a.id)!, durationMs: a.durationMs })),
    ];

    // Anything still pointing at a storage path rather than a DB row (assets
    // written straight to disk by the AI pipeline) is resolved directly.
    for (const clip of project.clips) {
      const localPath = storageSrcToLocalPath(clip.raw?.src);
      if (!localPath) continue;
      if (clip.mediaAssetId && !mediaPathById.has(clip.mediaAssetId)) {
        mediaPathById.set(clip.mediaAssetId, localPath);
        resolvedMedia.push({ mediaAssetId: clip.mediaAssetId, localPath, durationMs: null });
      } else if (clip.audioAssetId && !resolvedMedia.some((m) => m.audioAssetId === clip.audioAssetId)) {
        resolvedMedia.push({ audioAssetId: clip.audioAssetId, localPath, durationMs: null });
      }
    }

    const capabilities = await getCapabilities();
    logger.info("export", "Encoder selected", { jobId, encoder: capabilities.encoder });
    const { path: outputPath, fileName } = exportOutputPath(options.projectId, options.format);

    // 1. Audio — reuses filtergraph-builder.ts's proven mixing graph,
    // mapping only its audio output (no video filtering/encoding runs).
    onProgress(2);
    const audioPath = await timings.measure("audio", () =>
      mixProjectAudio(
        capabilities.ffmpegPath,
        { project, media: resolvedMedia, canvasWidth: width, canvasHeight: height },
        tempDir,
        jobId,
      ).catch((err) => {
        logger.warn("export", "Audio mix failed — exporting without audio", { jobId, error: String(err) });
        return null;
      }),
    );
    if (!audioPath && project.clips.some((c) => c.kind === "audio" || c.kind === "video")) {
      // Returning null (rather than throwing) means "the graph had no audio
      // output at all" — usually because no clip resolved to a real file.
      // Silence in the exported video is exactly the kind of failure that
      // must never be silent in the log.
      logger.warn("export", "No audio track was produced — the export will be silent", {
        jobId,
        audioClips: project.clips.filter((c) => c.kind === "audio").length,
        resolvedInputs: resolvedMedia.length,
      });
    }
    if (audioPath) tempFiles.push(audioPath);
    onProgress(8);
    if (active.cancelled) throw new Error("Export cancelled");

    // 2. Hidden GPU render window
    const renderWindow = await openRenderWindow();
    active.renderWindow = renderWindow;
    onProgress(12);
    if (active.cancelled) throw new Error("Export cancelled");

    // 3. Decode + encode pipelines
    const decodePipeline = new DecodePipeline(capabilities.ffmpegPath, project, mediaPathById, width, height);
    active.decodePipeline = decodePipeline;

    const silentOutputPath = path.join(tempDir, `video-${jobId}.mp4`);
    tempFiles.push(silentOutputPath);
    const totalFrames = Math.max(1, Math.round(project.durationSec * project.fps));

    const encodePipeline = new EncodePipeline({
      ffmpegPath: capabilities.ffmpegPath,
      width,
      height,
      fps: project.fps,
      encoder: capabilities.encoder,
      format: options.format,
      outputPath: silentOutputPath,
      audioPath: audioPath ?? undefined,
      totalDurationSec: project.durationSec,
      onProgress: (pct) => {
        const overall = 12 + pct * 0.68; // encode spans ~[12, 80]
        void updateExportProgress(jobId, overall);
        onProgress(overall);
      },
    });
    active.encodeProcessKiller = () => encodePipeline.cancel();

    const clipsById = new Map(project.clips.map((c) => [c.id, c]));

    /** Still-image clips are re-read from disk on every frame they're
     * visible, which for a 30 s title card is ~900 identical file reads.
     * They are immutable for the whole export, so one read is enough. */
    const imageCache = new Map<string, { bytes: Buffer; mimeType: string } | null>();
    const imageFrame = (clip: NativeClip): { bytes: Buffer; mimeType: string } | null => {
      if (!imageCache.has(clip.id)) imageCache.set(clip.id, readImageClipFrame(clip, mediaPathById));
      return imageCache.get(clip.id)!;
    };

    /** Builds every wire layer for one output frame — the decode half of the
     * loop, kept separate so it can run one frame ahead of the compositor. */
    const buildFrame = async (frameIdx: number): Promise<RenderWireLayer[]> => {
      const timeSec = frameIdx / project.fps;
      const frame = timings.measureSync("timeline", () => resolveFrameAt(project, timeSec));
      const wireLayers: RenderWireLayer[] = [];

      for (const layer of frame.layers) {
        // Shapes have no compositor path yet — still an FFmpeg post-pass.
        if (layer.kind === "shape") continue;

        const clip = clipsById.get(layer.clipId);
        if (!clip) continue;

        const wire: RenderWireLayer = {
          clipId: layer.clipId,
          xPct: layer.transform.xPct,
          yPct: layer.transform.yPct,
          wPct: layer.transform.wPct,
          hPct: layer.transform.hPct,
          rotationDeg: layer.transform.rotationDeg,
          opacity: layer.transform.opacity,
          fit: layer.fit,
          effects: layer.effects.map(mapEffectToWire),
          cropInsetPct: layer.cropInsetPct,
        };

        if (layer.kind === "video") {
          const decoded = await timings.measure("decode", () => decodePipeline.getNextFrame(clip));
          if (!decoded) continue; // no frame and no previous frame to hold — nothing to draw
          wire.rgba = decoded.data;
          wire.srcWidth = decoded.width;
          wire.srcHeight = decoded.height;
        } else if (layer.kind === "image") {
          const img = imageFrame(clip);
          if (!img) continue;
          wire.encoded = img.bytes;
          wire.mimeType = img.mimeType;
        } else if (layer.kind === "text") {
          const content = clip.text?.content ?? "";
          if (!content) continue;
          wire.text = {
            content,
            kind: textKindOf(clip),
            style: (clip.text?.style ?? {}) as Record<string, unknown>,
            words: wordsOf(clip),
            // Word highlighting is relative to the clip's own start, so the
            // exported frame highlights exactly the word the preview does.
            timeMs: (timeSec - clip.startSec) * 1000,
          };
        } else {
          continue;
        }

        wireLayers.push(wire);
      }
      return wireLayers;
    };

    // The three stages are independent processes, so there is no reason to
    // idle two of them while the third works. Decoding frame N+1 while the
    // compositor renders frame N (and ffmpeg encodes frame N-1, which
    // writeFrame() already queues asynchronously) overlaps the ffmpeg
    // decode cost with the GPU cost almost entirely.
    let nextFrame: Promise<RenderWireLayer[]> | null = totalFrames > 0 ? buildFrame(0) : null;
    let framesWithNoVisualLayers = 0;
    const backgroundColor = project.backgroundColor ?? "#000000";
    let backgroundFrame: Buffer | null = null;

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (active.cancelled) throw new Error("Export cancelled");

      const wireLayers = await nextFrame!;
      nextFrame = frameIdx + 1 < totalFrames ? buildFrame(frameIdx + 1) : null;
      let rgba: Buffer;
      if (wireLayers.length === 0) {
        // A frame with no visual layers is just the background, and the
        // background never changes during an export — so compositing and
        // reading back 8 MB of identical pixels for every such frame is pure
        // waste. Timelines routinely have long stretches of these (gaps
        // between clips, or audio running past the last video clip).
        framesWithNoVisualLayers++;
        backgroundFrame ??= await timings.measure("transfer+render", () =>
          renderWindow.renderFrame(width, height, backgroundColor, []),
        );
        rgba = backgroundFrame;
      } else {
        rgba = await timings.measure("transfer+render", () =>
          renderWindow.renderFrame(width, height, backgroundColor, wireLayers),
        );
      }
      await timings.measure("encode", () => encodePipeline.writeFrame(rgba));
    }

    await timings.measure("encode", () => encodePipeline.finish());

    // A frame with no visual layers is legitimately just the background —
    // but if it's most of the timeline the user is about to watch a mostly
    // black video, and they should be able to find out why from the log
    // rather than by staring at the output.
    if (framesWithNoVisualLayers > 0) {
      logger.warn("export", "Frames with no visual layers were rendered as plain background", {
        jobId,
        frames: framesWithNoVisualLayers,
        totalFrames,
        percent: Math.round((framesWithNoVisualLayers / totalFrames) * 100),
        backgroundColor: project.backgroundColor ?? "#000000",
      });
    }
    for (const stat of decodePipeline.stats()) {
      if (stat.framesStarved === 0 && !stat.spawnFailed) continue;
      logger.warn("export", "Clip decoder could not supply every frame the timeline asked for", {
        jobId,
        ...stat,
        lastError: stat.lastError.slice(-300),
      });
    }
    logger.info("export", "Export stage timings", { jobId, engine: renderWindow.engine(), ...timings.summary(totalFrames) });
    console.log(timings.table(totalFrames));
    decodePipeline.closeAll();
    renderWindow.close();
    active.decodePipeline = null;
    active.renderWindow = null;
    active.encodeProcessKiller = null;

    onProgress(82);
    if (active.cancelled) throw new Error("Export cancelled");

    // 4. Subtitle-track burn-in.
    //
    // Text CLIPS are no longer burned in here — they are composited by the
    // GPU compositor through the same shared text model and rasteriser the
    // editor preview uses (lib/text/*), which is what makes the export match
    // the preview. The ASS path remains only for a separately-managed
    // SubtitleTrack the user explicitly asked to burn in, which has no
    // corresponding timeline clips to composite.
    let finalPath = silentOutputPath;
    const textClips: NativeClip[] = [];

    let subtitleCues: SubtitleCue[] = [];
    let subtitleStyle: SubtitleStyle = {};
    if (options.subtitleBurnIn && options.subtitleTrackId) {
      const track = await getSubtitleTrack(options.subtitleTrackId);
      if (track) {
        subtitleCues = (track.cues as SubtitleCue[]) ?? [];
        subtitleStyle = (track.customStyle as SubtitleStyle) ?? {};
      }
    }

    if (textClips.length > 0 || subtitleCues.length > 0) {
      finalPath = await timings.measure("burnIn", () =>
        burnInText(
          capabilities.ffmpegPath, silentOutputPath, tempDir, jobId,
          textClips, subtitleCues, subtitleStyle, width, height, tempFiles,
          project.width, project.height,
        ),
      );
    }
    onProgress(95);

    if (finalPath !== outputPath) fs.copyFileSync(finalPath, outputPath);

    const stat = fs.statSync(outputPath);
    await completeExportJob(jobId, exportDownloadUrl(options.projectId, fileName), stat.size);
    onProgress(100);
    logger.info("export", "Export completed", {
      jobId,
      totalMs: Math.round(totalTimer.elapsedMs()),
      fileSizeBytes: stat.size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const classified = classifyExportError(message);
    logger.error("export", "Export failed", {
      jobId,
      code: classified.code,
      totalMs: Math.round(totalTimer.elapsedMs()),
      // Long enough to keep ffmpeg's stderr tail, which is usually the only
      // thing that explains the failure — 500 chars used to cut it off.
      raw: message.slice(0, 2000),
    });
    await failExportJob(jobId, classified.userMessage);
  } finally {
    active.renderWindow?.close();
    active.decodePipeline?.closeAll();
    activeExports.delete(jobId);
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}
