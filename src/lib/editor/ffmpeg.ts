import { spawn, type SpawnOptions } from "child_process";

/** Resolved FFmpeg executable (bundled binary or PATH). */
export function getFfmpegPath(): string {
  try {
    // ffmpeg-static ships a platform binary at install time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundled = require("ffmpeg-static") as string | null | undefined;
    if (bundled && typeof bundled === "string") {
      return bundled;
    }
  } catch {
    /* optional dependency */
  }
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
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
