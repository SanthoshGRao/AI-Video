/**
 * probe.ts — ffprobe-based media metadata, run in the Electron main
 * process via a short-lived child process. Replaces the old web app's
 * worker-falls-back-to-hidden-<video>-element approach (which hardcoded
 * fps to 30 because a Web Worker can't get real video metadata without
 * WebCodecs — see editor-v2/editor/media-engine.ts's original comment).
 */

import { spawn } from "child_process";
import { getCapabilities } from "../export/ffmpeg-locate";

export interface ProbedMediaInfo {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fps: number | null;
  hasAudio: boolean;
}

interface FfprobeStream {
  codec_type: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
}

interface FfprobeOutput {
  streams: FfprobeStream[];
  format?: { duration?: string };
}

function parseFrameRate(rate: string | undefined): number | null {
  if (!rate) return null;
  const [num, den] = rate.split("/").map(Number);
  if (!den) return num || null;
  return num / den;
}

export async function probeMedia(filePath: string): Promise<ProbedMediaInfo> {
  const { ffprobePath } = await getCapabilities();

  const args = ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", filePath];

  const output = await new Promise<string>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(ffprobePath, args, { windowsHide: true });
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });

  const parsed = JSON.parse(output) as FfprobeOutput;
  const videoStream = parsed.streams.find((s) => s.codec_type === "video");
  const audioStream = parsed.streams.find((s) => s.codec_type === "audio");

  const durationSec = Number(parsed.format?.duration ?? videoStream?.duration ?? 0);

  return {
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    durationMs: durationSec > 0 ? Math.round(durationSec * 1000) : null,
    fps: parseFrameRate(videoStream?.r_frame_rate),
    hasAudio: !!audioStream,
  };
}
