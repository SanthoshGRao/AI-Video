/**
 * decode-pipeline.ts — one persistent, sequential-read FFmpeg decode
 * process per active video clip instance, replacing filtergraph-builder.ts's
 * single whole-timeline filter graph. FFmpeg's job here is decode + scale
 * only (no compositing): each clip is decoded straight to its own
 * placement-box resolution as a **raw RGBA stream**, at the clip's own
 * effective frame rate (project fps * playbackRate) so exactly one decoded
 * frame maps to one output frame while that clip is active.
 *
 * Frames are consumed strictly in order — correct because the render loop
 * always advances output timestamps forward, so a clip's required source
 * timestamps are monotonically increasing too. No seeking after the
 * decoder starts.
 *
 * Why rawvideo and not PNG (this used to pipe `-vcodec png`):
 *  - PNG cost a full deflate compress in ffmpeg *and* a full inflate +
 *    image decode in the compositor page, per layer per frame, for bytes
 *    that were thrown away microseconds later. It was the single largest
 *    per-frame CPU cost in the export.
 *  - Framing a PNG stream requires scanning for signature/IEND markers,
 *    which is both O(n) per chunk and *not sound*: the 4 bytes "IEND" can
 *    occur by chance inside compressed IDAT data, truncating a frame and
 *    desynchronising every subsequent frame in the stream.
 *  Raw frames are a fixed, known byte count, so framing is exact.
 *
 * Backpressure: ffmpeg decodes far faster than the GPU compositor consumes,
 * and a raw 1080x1920 frame is 8.3 MB. Without flow control a single clip
 * buffers gigabytes in the main process (the old PNG path had the same bug,
 * just with smaller frames). stdout is paused once QUEUE_HIGH_WATER frames
 * are buffered and resumed as the render loop drains them.
 */
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import type { NativeClip, NativeProject } from "../model/types";

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
};

/** How many decoded frames a single clip may buffer before its ffmpeg
 * process is back-pressured. 4 keeps the decoder just far enough ahead to
 * hide its own latency without letting it run away with memory. */
/** How many decoded frames a single clip may buffer before its ffmpeg
 * process is back-pressured. 2 keeps the decoder just far enough ahead to
 * hide its own latency without letting it run away with memory. */
const QUEUE_HIGH_WATER = 2;

/** One decoded, already-scaled layer image. `data` is tightly packed RGBA,
 * top row first, exactly width*height*4 bytes. */
export interface DecodedFrame {
  data: Buffer;
  width: number;
  height: number;
}

/** Static image clips need no decode process — read the source file
 * directly in its native format (the compositor page decodes PNG/JPEG/
 * WebP/GIF/AVIF via createImageBitmap, no need to force everything through
 * ffmpeg the way video frames are). */
export function readImageClipFrame(
  clip: NativeClip,
  mediaPathById: Map<string, string>,
): { bytes: Buffer; mimeType: string } | null {
  const srcPath = clip.mediaAssetId ? mediaPathById.get(clip.mediaAssetId) : undefined;
  if (!srcPath || !fs.existsSync(srcPath)) return null;
  const mimeType = IMAGE_MIME_BY_EXT[path.extname(srcPath).toLowerCase()] ?? "image/png";
  return { bytes: fs.readFileSync(srcPath), mimeType };
}

export class ClipDecoder {
  private proc: ChildProcess;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private queue: Buffer[] = [];
  private waiters: Array<(buf: Buffer | null) => void> = [];
  private ended = false;
  private paused = false;
  private stderrTail = "";

  readonly frameBytes: number;

  constructor(
    ffmpegPath: string,
    srcPath: string,
    startAtSec: number,
    /** How much *source* time this clip actually needs. Without it ffmpeg
     * decodes to the end of the file no matter how short the clip is —
     * for a 2-second cut of a 10-minute source that is ~300x more decode
     * work than the export can ever use. */
    durationSec: number,
    fps: number,
    readonly width: number,
    readonly height: number,
    fit: "cover" | "contain" | "fill",
  ) {
    this.frameBytes = width * height * 4;

    const scaleFilter =
      fit === "contain"
        ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
        : fit === "fill"
          ? `scale=${width}:${height}`
          : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;

    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-ss", Math.max(0, startAtSec).toFixed(3),
      "-i", srcPath,
      // A little slack past the clip's own length absorbs seek rounding and
      // the fps filter's boundary behaviour without decoding the whole file.
      "-t", Math.max(0.1, durationSec + 0.5).toFixed(3),
      // Audio/subtitle/data streams are handled by audio-mix.ts, not here —
      // decoding them in this process is pure waste.
      "-an", "-sn", "-dn",
      "-vf", `fps=${fps},${scaleFilter},format=rgba`,
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "pipe:1",
    ];

    this.proc = spawn(ffmpegPath, args, { windowsHide: true });
    this.proc.stdout!.on("data", (chunk: Buffer) => this.onData(chunk));
    this.proc.stderr!.on("data", (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-2000);
    });
    this.proc.on("close", () => {
      this.ended = true;
      while (this.waiters.length) this.waiters.shift()!(this.queue.shift() ?? null);
    });
    this.proc.on("error", () => {
      this.ended = true;
      while (this.waiters.length) this.waiters.shift()!(null);
    });
  }

  private onData(chunk: Buffer): void {
    this.pending.push(chunk);
    this.pendingBytes += chunk.length;
    if (this.pendingBytes < this.frameBytes) return;

    // Only concat once we know at least one whole frame is present —
    // concatenating on every chunk is O(n^2) over the stream.
    const merged = this.pending.length === 1 ? this.pending[0] : Buffer.concat(this.pending, this.pendingBytes);
    let offset = 0;
    while (this.pendingBytes - offset >= this.frameBytes) {
      // Allocate from Node's internal slab pool to prevent ArrayBuffer OOM failures.
      const frame = Buffer.allocUnsafe(this.frameBytes);
      merged.copy(frame, 0, offset, offset + this.frameBytes);
      offset += this.frameBytes;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(frame);
      } else {
        this.queue.push(frame);
      }
    }
    const remainder = merged.subarray(offset);
    this.pending = remainder.length ? [remainder] : [];
    this.pendingBytes = remainder.length;

    if (!this.paused && this.queue.length >= QUEUE_HIGH_WATER) {
      this.paused = true;
      try { this.proc.stdout?.pause(); } catch { /* noop */ }
    }
  }

  /** Next decoded frame in source order, or null once the decoder is done
   * and has no more buffered frames. */
  nextFrame(): Promise<Buffer | null> {
    const frame = this.queue.length > 0 ? this.queue.shift()! : null;
    if (this.paused && this.queue.length < QUEUE_HIGH_WATER) {
      this.paused = false;
      try { this.proc.stdout?.resume(); } catch { /* noop */ }
    }
    if (frame) return Promise.resolve(frame);
    if (this.ended) return Promise.resolve(null);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  get lastError(): string {
    return this.stderrTail;
  }

  close(): void {
    if (!this.proc.killed) this.proc.kill();
  }
}

/** Per-clip decode accounting, surfaced by export-runner.ts so a starved or
 * failed decoder is a visible warning instead of silently black video. */
export interface DecodeStats {
  clipId: string;
  framesServed: number;
  /** Frames the render loop asked for that the decoder could not produce
   * (source shorter than the clip, decode error, killed process...). */
  framesStarved: number;
  spawnFailed: boolean;
  lastError: string;
}

export class DecodePipeline {
  private decoders = new Map<string, ClipDecoder>();
  private lastFrames = new Map<string, DecodedFrame>();
  private statsByClip = new Map<string, DecodeStats>();

  constructor(
    private ffmpegPath: string,
    private project: NativeProject,
    private mediaPathById: Map<string, string>,
    /** The export's actual output canvas size (from the chosen resolution/
     * aspect ratio) — NOT necessarily project.width/height, which is just
     * the timeline's authoring canvas and can differ from what the user
     * exports at (e.g. a 1080x1920-authored project exported at 720p). */
    private canvasWidth: number,
    private canvasHeight: number,
  ) {}

  private statsFor(clipId: string): DecodeStats {
    let s = this.statsByClip.get(clipId);
    if (!s) {
      s = { clipId, framesServed: 0, framesStarved: 0, spawnFailed: false, lastError: "" };
      this.statsByClip.set(clipId, s);
    }
    return s;
  }

  /** Lazily starts (once) and returns the decoder for this clip instance,
   * sized to the clip's own placement box so a small picture-in-picture
   * clip isn't decoded at full canvas resolution. */
  private getOrCreateDecoder(clip: NativeClip): ClipDecoder | null {
    const existing = this.decoders.get(clip.id);
    if (existing) return existing;

    const srcPath = clip.mediaAssetId ? this.mediaPathById.get(clip.mediaAssetId) : undefined;
    if (!srcPath) {
      this.statsFor(clip.id).spawnFailed = true;
      return null;
    }

    // clip.transform.w/h are absolute PIXELS against the project's authoring
    // canvas (project.width/height) — NOT 0-100 percentages. Same convention
    // documented and applied in timeline-evaluator.ts's resolveFrameAt().
    // Normalize to a fraction of the authoring canvas, then scale to this
    // export's actual output canvas size.
    const t = clip.transform ?? { x: 0, y: 0, w: this.project.width, h: this.project.height, rotationDeg: 0, opacity: 1 };
    const boxWidth = evenClamp((t.w / this.project.width) * this.canvasWidth);
    const boxHeight = evenClamp((t.h / this.project.height) * this.canvasHeight);
    const playbackRate = clip.playbackRate ?? 1;
    const fps = this.project.fps * playbackRate;
    const sourceSpanSec = Math.max(0, clip.endSec - clip.startSec) * playbackRate;

    const decoder = new ClipDecoder(
      this.ffmpegPath,
      srcPath,
      clip.mediaInSec ?? 0,
      sourceSpanSec,
      fps,
      boxWidth,
      boxHeight,
      clip.fit ?? "cover",
    );
    this.decoders.set(clip.id, decoder);
    return decoder;
  }

  /** Pulls this clip's next source frame — must be called exactly once per
   * output frame the clip is active for, in timestamp order, so the
   * decoder's sequential stream stays aligned.
   *
   * On underrun (source shorter than the clip, decoder died) the clip's
   * **last good frame is held** rather than the layer being dropped: a
   * frozen last frame is a far better failure mode than the clip blinking
   * out to background, and the starvation is counted in stats() so it is
   * reported instead of silently swallowed.
   */
  async getNextFrame(clip: NativeClip): Promise<DecodedFrame | null> {
    const stats = this.statsFor(clip.id);
    const decoder = this.getOrCreateDecoder(clip);
    if (!decoder) {
      stats.framesStarved++;
      return this.lastFrames.get(clip.id) ?? null;
    }

    const data = await decoder.nextFrame();
    if (!data) {
      stats.framesStarved++;
      stats.lastError = decoder.lastError;
      return this.lastFrames.get(clip.id) ?? null;
    }

    stats.framesServed++;
    const frame: DecodedFrame = { data, width: decoder.width, height: decoder.height };
    this.lastFrames.set(clip.id, frame);
    return frame;
  }

  stats(): DecodeStats[] {
    return [...this.statsByClip.values()];
  }

  closeAll(): void {
    for (const decoder of this.decoders.values()) decoder.close();
    this.decoders.clear();
    this.lastFrames.clear();
  }
}

/** ffmpeg's scale filter is happiest with even dimensions, and a zero-sized
 * box would make the decoder emit nothing at all. */
function evenClamp(n: number): number {
  const r = Math.max(2, Math.round(n));
  return r % 2 === 0 ? r : r + 1;
}
