/**
 * ffmpeg-locate.ts — resolves the bundled ffmpeg/ffprobe binaries and
 * probes hardware encoder availability once per app run (cached).
 *
 * Deliberately NOT using the `ffmpeg-static` npm package the web app
 * depends on: it ships minimal builds with no NVENC/QSV/AMF encoders.
 * Instead this expects a full/GPL static build's ffmpeg.exe/ffprobe.exe
 * bundled at `resources/ffmpeg/` (see electron-builder.config.js), falling
 * back to `PATH` in dev if that hasn't been downloaded yet.
 */

import { app } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export type HardwareEncoder = "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264";

interface Capabilities {
  ffmpegPath: string;
  ffprobePath: string;
  encoder: HardwareEncoder;
}

let cached: Capabilities | null = null;

function resourcesFfmpegDir(): string {
  // This file compiles to dist/editor/export/ffmpeg-locate.js, so
  // __dirname is dist/editor/export — three levels up reaches
  // "Desktop Application/", the sibling of dist/ where resources/ lives
  // (same pattern as fonts.ts's bundledFontsDir()).
  return app.isPackaged
    ? path.join(process.resourcesPath, "ffmpeg")
    : path.join(__dirname, "..", "..", "..", "resources", "ffmpeg");
}

function resolveBinary(name: "ffmpeg" | "ffprobe"): string {
  const exeName = process.platform === "win32" ? `${name}.exe` : name;
  const bundled = path.join(resourcesFfmpegDir(), exeName);
  if (fs.existsSync(bundled)) return bundled;
  // Dev fallback: rely on PATH until the full build has been downloaded
  // into Desktop Application/resources/ffmpeg (see README for the fetch
  // script) — keeps `npm run dev` usable before that one-time setup.
  return exeName;
}

function run(bin: string, args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    let stdout = "";
    const child = spawn(bin, args, { windowsHide: true });
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stdout += d.toString()));
    child.on("error", () => resolve({ stdout, code: -1 }));
    child.on("close", (code) => resolve({ stdout, code: code ?? -1 }));
  });
}

/**
 * Actually encodes a few frames with `encoder` and discards them.
 *
 * `-encoders` only reports what ffmpeg was COMPILED with, which says nothing
 * about whether this machine can open an encode session right now — the GPU
 * may be absent, the driver mismatched, or every NVENC session already in use.
 * Selecting on the compiled-in list alone meant such a machine picked NVENC
 * and then failed the entire export, with the taxonomy promising a fallback to
 * software encoding that nothing implemented. Costs well under a second, once
 * per app run.
 */
async function encoderWorks(ffmpegPath: string, encoder: HardwareEncoder): Promise<boolean> {
  const { code } = await run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=320x240:r=30",
    "-frames:v", "3",
    "-c:v", encoder,
    "-f", "null", "-",
  ]);
  return code === 0;
}

/** Preference order: NVENC > QSV > AMF > software libx264. */
async function probeEncoder(ffmpegPath: string): Promise<HardwareEncoder> {
  const { stdout, code } = await run(ffmpegPath, ["-hide_banner", "-encoders"]);
  if (code !== 0) return "libx264";

  const candidates: HardwareEncoder[] = [];
  if (/\bh264_nvenc\b/.test(stdout)) candidates.push("h264_nvenc");
  if (/\bh264_qsv\b/.test(stdout)) candidates.push("h264_qsv");
  if (/\bh264_amf\b/.test(stdout)) candidates.push("h264_amf");

  for (const candidate of candidates) {
    if (await encoderWorks(ffmpegPath, candidate)) return candidate;
    console.warn(`[ffmpeg-locate] ${candidate} is compiled in but failed a test encode — trying the next encoder`);
  }
  return "libx264";
}

/**
 * Confirms a binary can actually START, not merely that the file exists.
 *
 * `resolveBinary` only checks for the file on disk, which is how a bundled
 * `ffprobe.exe` from a SHARED-library build (168 KB, none of its DLLs present)
 * sat next to a working 82 MB static `ffmpeg.exe` unnoticed: every probe call
 * died with "error while loading shared libraries" and the failure was only
 * ever visible to whichever caller happened to catch it.
 */
async function isRunnable(binPath: string): Promise<boolean> {
  const { code, stdout } = await run(binPath, ["-hide_banner", "-version"]);
  return code === 0 && /version/i.test(stdout);
}

export async function getCapabilities(): Promise<Capabilities> {
  if (cached) return cached;

  const ffmpegPath = resolveBinary("ffmpeg");
  const ffprobePath = resolveBinary("ffprobe");
  const encoder = await probeEncoder(ffmpegPath);

  if (!(await isRunnable(ffprobePath))) {
    // Loud, and once per app run — media probing (duration/fps/dimensions)
    // silently degrades without it. See resources/ffmpeg/README.md for the
    // build to install.
    console.error(
      `[ffmpeg-locate] ffprobe at "${ffprobePath}" cannot run — media probing will fail. ` +
        `Install a full/GPL static build into Desktop Application/resources/ffmpeg (see its README.md).`,
    );
  }

  cached = { ffmpegPath, ffprobePath, encoder };
  console.log(`[ffmpeg-locate] Using encoder: ${encoder} (${ffmpegPath})`);
  return cached;
}
