import { spawn, type SpawnOptions } from "child_process";
import fs from "fs";

/** Resolved FFmpeg executable (bundled binary or PATH). */
export function getFfmpegPath(): string {
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  try {
    // ffmpeg-static ships a platform binary at install time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundled = require("ffmpeg-static") as string | null | undefined;
    if (bundled && typeof bundled === "string") {
      if (fs.existsSync(bundled)) {
        return bundled;
      }
      // In Next.js standalone mode (.next/standalone), node_modules/ffmpeg-static/ffmpeg.exe
      // may not exist in the standalone directory, but exists in the root workspace node_modules
      const rootPath = bundled.replace(/[\\/]\.next[\\/]standalone[\\/]/, "/");
      if (fs.existsSync(rootPath)) {
        return rootPath;
      }
    }
  } catch {
    /* optional dependency */
  }
  return "ffmpeg";
}

export function runFfmpeg(args: string[]): Promise<void> {
  const ffmpegPath = getFfmpegPath();

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-y", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    } as SpawnOptions);

    let err = "";
    proc.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });

    proc.on("error", (e) => {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "FFmpeg is not installed. Run: npm install ffmpeg-static (then restart the dev server)."
          )
        );
      } else {
        reject(e);
      }
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-800) || `FFmpeg exited with code ${code}`));
    });
  });
}

/**
 * Hardware H.264 encoders, in detection preference order, with software as
 * the guaranteed-available fallback. Detection is a real encode attempt (not
 * just "is it compiled in") because ffmpeg-static bundles NVENC/QSV/AMF
 * support regardless of whether this machine actually has the GPU/driver for
 * it — a compiled-in encoder still fails to *open* without matching hardware.
 */
export type VideoEncoder = "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264";

const HARDWARE_ENCODERS: readonly VideoEncoder[] = ["h264_nvenc", "h264_qsv", "h264_amf"];

let cachedEncoder: VideoEncoder | null = null;
let cachedEncoderPromise: Promise<VideoEncoder> | null = null;

async function canOpenEncoder(encoder: VideoEncoder): Promise<boolean> {
  try {
    // 320x240 stays above NVENC's minimum encode dimensions (a too-small
    // probe frame reports a false "unavailable" for a real GPU).
    await runFfmpeg([
      "-f", "lavfi", "-i", "color=c=black:s=320x240:d=0.2",
      "-frames:v", "2",
      "-c:v", encoder,
      "-f", "null", "-",
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Detects the best available H.264 encoder once per process and caches it. */
export async function pickVideoEncoder(): Promise<VideoEncoder> {
  if (cachedEncoder) return cachedEncoder;
  if (cachedEncoderPromise) return cachedEncoderPromise;

  cachedEncoderPromise = (async () => {
    for (const encoder of HARDWARE_ENCODERS) {
      if (await canOpenEncoder(encoder)) {
        cachedEncoder = encoder;
        return encoder;
      }
    }
    cachedEncoder = "libx264";
    return "libx264" as VideoEncoder;
  })();

  return cachedEncoderPromise;
}

/**
 * Encode flags for a chosen encoder. `quality` is a CRF-like knob (lower =
 * better/bigger, ~18-28 typical); each hardware encoder gets the closest
 * equivalent since none of them accept `-crf`.
 */
export function videoEncodeArgs(
  encoder: VideoEncoder,
  opts: { quality?: number; fast?: boolean } = {},
): string[] {
  const quality = opts.quality ?? 20;
  switch (encoder) {
    case "h264_nvenc":
      return [
        "-c:v", "h264_nvenc",
        "-preset", opts.fast ? "p3" : "p5",
        "-rc:v", "vbr",
        "-cq", String(quality),
        "-b:v", "0",
      ];
    case "h264_qsv":
      return [
        "-c:v", "h264_qsv",
        "-preset", opts.fast ? "faster" : "medium",
        "-global_quality", String(quality + 3),
      ];
    case "h264_amf":
      return [
        "-c:v", "h264_amf",
        "-quality", opts.fast ? "speed" : "balanced",
        "-rc", "cqp",
        "-qp_i", String(quality),
        "-qp_p", String(quality + 2),
      ];
    default:
      return [
        "-c:v", "libx264",
        "-preset", opts.fast ? "fast" : "medium",
        "-crf", String(quality),
      ];
  }
}
