/**
 * encode-pipeline.ts — the Encoder Queue: a single FFmpeg process that
 * reads composited RGBA frames from stdin (`-f rawvideo`) and encodes them
 * with the hardware encoder ffmpeg-locate.ts picked, muxing in a pre-mixed
 * audio track if one was produced (see audio-mix.ts). FFmpeg does no
 * compositing here — every pixel it receives is already final.
 */
import { spawn, type ChildProcess } from "child_process";
import type { HardwareEncoder } from "./ffmpeg-locate";

export function encoderArgs(encoder: HardwareEncoder, format: string): string[] {
  if (format === "webm") return ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0"];

  switch (encoder) {
    case "h264_nvenc":
      return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "20", "-b:v", "0"];
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-preset", "medium", "-global_quality", "20"];
    case "h264_amf":
      return ["-c:v", "h264_amf", "-quality", "balanced", "-rc", "cqp", "-qp_i", "20", "-qp_p", "22"];
    default:
      return ["-c:v", "libx264", "-preset", "medium", "-crf", "20"];
  }
}

export interface EncodePipelineOptions {
  ffmpegPath: string;
  width: number;
  height: number;
  fps: number;
  encoder: HardwareEncoder;
  format: "mp4" | "mov" | "webm";
  outputPath: string;
  /** Pre-mixed audio track (see audio-mix.ts) to mux in, if the project has any audio. */
  audioPath?: string;
  totalDurationSec: number;
  onProgress?: (percent: number) => void;
}

export class EncodePipeline {
  private proc: ChildProcess;
  private writeQueue: Promise<void> = Promise.resolve();
  private stderrTail = "";
  private stdoutBuffer = "";
  private closed: Promise<void>;
  /** Why ffmpeg died, once it has. See `encoderFailure()`. */
  private closeError: Error | null = null;
  private stdinError: Error | null = null;
  private exited = false;

  constructor(private opts: EncodePipelineOptions) {
    const { ffmpegPath, width, height, fps, encoder, format, outputPath, audioPath, totalDurationSec, onProgress } = opts;

    const args: string[] = [
      "-y",
      // Keeps ~15 lines of version/configuration banner out of stderr, so the
      // captured tail is diagnostics only.
      "-hide_banner",
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "-s", `${width}x${height}`,
      "-r", String(fps),
      "-i", "pipe:0",
    ];
    if (audioPath) args.push("-i", audioPath);

    // The compositor reads frames back with gl.readPixels, whose origin is
    // bottom-left, and deliberately does not flip them itself: doing it here
    // fuses the flip into the colour conversion ffmpeg already runs, on
    // ffmpeg's own threads, instead of costing a frame-sized copy on the
    // render loop's critical path. See readCanvasRgba() in the
    // export-render-worker page.
    args.push("-vf", "vflip");
    args.push(...encoderArgs(encoder, format), "-pix_fmt", "yuv420p", "-r", String(fps));

    if (audioPath) {
      // `-shortest` alone ends the whole output when the SHORTEST input ends —
      // and the mixed audio track is routinely shorter than the timeline (a
      // voiceover that stops before the last clip, say). ffmpeg would then
      // finish and exit cleanly partway through, closing this pipe while the
      // render loop was still sending frames: the loop reported "encoder stdin
      // is closed" and the export failed, even though ffmpeg had succeeded —
      // at a video truncated to the length of the audio.
      //
      // `-af apad` pads the audio with silence indefinitely, which makes the
      // VIDEO the shortest stream, so `-shortest` now ends the output exactly
      // when the render loop closes stdin. Output length == timeline length,
      // whether the audio is shorter or longer.
      args.push("-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-af", "apad", "-shortest");
    } else {
      args.push("-an");
    }

    args.push("-movflags", "+faststart", "-progress", "pipe:2", "-nostats", outputPath);

    // stdout is "ignore", not "pipe": the encoded video goes to a file, so
    // ffmpeg writes nothing there — but an unread pipe is a latent deadlock
    // (if ffmpeg ever did write, it would block once the OS buffer filled and
    // nothing drained it).
    this.proc = spawn(ffmpegPath, args, { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });

    // When ffmpeg exits while frames are still being piped in, the stdin
    // socket emits 'error' (EPIPE/EOF) in ADDITION to passing the error to
    // write()'s callback. A Node stream with no 'error' listener rethrows it
    // as an uncaught exception — which in the main process takes the app down
    // instead of failing the export cleanly. Recording it here keeps the
    // failure inside the normal error path, where encoderFailure() can replace
    // it with ffmpeg's real complaint.
    this.proc.stdin?.on("error", (err: Error) => {
      this.stdinError = err;
    });

    // -progress pipe:2 shares the stderr fd — ffmpeg interleaves its normal
    // diagnostic lines with `key=value\n` progress lines on the same stream.
    //
    // Progress lines are deliberately kept OUT of stderrTail. They arrive
    // several times a second, so a raw tail of the stream is nothing but
    // progress spam by the time anything fails — the one line that explains
    // the failure has long since been evicted. Keeping only real diagnostics
    // means the tail ends with ffmpeg's actual complaint.
    this.proc.stderr?.on("data", (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString();
      const lines = this.stdoutBuffer.split("\n");
      this.stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^[a-z_0-9]+=/.test(trimmed)) {
          const match = /^out_time_ms=(-?\d+)/.exec(trimmed);
          if (match && onProgress && totalDurationSec > 0) {
            // ffmpeg's `out_time_ms` is actually microseconds.
            const outTimeSec = Number(match[1]) / 1_000_000;
            if (outTimeSec >= 0) onProgress(Math.min(99, (outTimeSec / totalDurationSec) * 100));
          }
          continue;
        }
        this.stderrTail = (this.stderrTail + trimmed + "\n").slice(-2000);
      }
    });

    this.closed = new Promise((resolve, reject) => {
      const fail = (err: Error) => {
        this.exited = true;
        this.closeError = err;
        reject(err);
      };
      this.proc.on("error", (err) => fail(err instanceof Error ? err : new Error(String(err))));
      this.proc.on("close", (code, signal) => {
        this.exited = true;
        if (code === 0) resolve();
        else if (signal) fail(new Error("Export cancelled"));
        else fail(new Error(`Encoder ffmpeg exited with code ${code}: ${this.stderrTail.slice(-800).trim()}`));
      });
    });
    // `this.closed` is only actually awaited later, in finish() — if the
    // process fails immediately (e.g. spawn ENOENT for a missing ffmpeg
    // binary), the 'error'/'close' listener above can reject this promise
    // before anything has attached a handler to it, which Node reports as
    // an unhandled rejection (and newer Node versions crash the process
    // for). This no-op catch just prevents that; finish()'s own `await
    // this.closed` still observes and surfaces the real rejection.
    this.closed.catch(() => {});
  }

  /**
   * The reason a write failed, which is almost never the write itself.
   *
   * stdin only becomes unwritable because ffmpeg already died, and the useful
   * diagnostic — its exit code and stderr tail — lives on `this.closed`. That
   * rejection used to be swallowed by the no-op catch below and the caller
   * surfaced a bare "encoder stdin is closed", which classifies as UNKNOWN and
   * tells nobody anything. So: if the exit reason is already known, report it;
   * otherwise wait briefly for the imminent 'close' event, and fall back to
   * whatever ffmpeg last printed.
   *
   * The wait is bounded so a wedged process can never hang the export.
   */
  private async encoderFailure(context: string): Promise<Error> {
    if (!this.closeError && !this.exited) {
      await Promise.race([
        this.closed.catch(() => undefined),
        new Promise((r) => setTimeout(r, 5000).unref?.()),
      ]);
    }
    if (this.closeError) return this.closeError;
    const tail = this.stderrTail.slice(-800).trim();
    const detail = tail || this.stdinError?.message || "";
    return new Error(detail ? `${context} — ffmpeg reported: ${detail}` : context);
  }

  /** Queues one composited frame for writing — calls are safe to await
   * sequentially even though the underlying stream may apply backpressure
   * (waits for 'drain' rather than buffering unboundedly in memory). */
  writeFrame(rgba: Buffer): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const stdin = this.proc.stdin;
      if (!stdin || stdin.destroyed) {
        throw await this.encoderFailure("encoder stdin is closed");
      }
      try {
        await new Promise<void>((resolve, reject) => {
          const ok = stdin.write(rgba, (err) => {
            if (err) reject(err);
          });
          if (ok) resolve();
          // If ffmpeg dies while we are waiting for backpressure to clear,
          // 'drain' never fires — so settle on close too, rather than
          // deadlocking the export loop forever.
          else {
            stdin.once("drain", resolve);
            this.closed.then(
              () => resolve(),
              (err) => reject(err),
            );
          }
        });
      } catch (err) {
        throw await this.encoderFailure(err instanceof Error ? err.message : String(err));
      }
    });
    return this.writeQueue;
  }

  /** Signals no more frames, then resolves once ffmpeg finishes encoding. */
  async finish(): Promise<void> {
    await this.writeQueue;
    this.proc.stdin?.end();
    await this.closed;
  }

  /** Kills the encoder immediately (export cancellation). */
  cancel(): void {
    if (!this.proc.killed) this.proc.kill();
  }
}
