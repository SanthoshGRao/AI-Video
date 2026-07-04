const THUMB_MAX_PX = 400;

async function loadSharp() {
  const mod = await import("sharp");
  return mod.default;
}

export async function getImageDimensions(
  source: Buffer
): Promise<{ width: number; height: number }> {
  const sharp = await loadSharp();
  const meta = await sharp(source).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

/** Resize image for grid preview; stored as JPEG under storage/thumbnails */
export async function generateImageThumbnail(source: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const sharp = await loadSharp();
  const thumbBuffer = await sharp(source)
    .rotate()
    .resize(THUMB_MAX_PX, THUMB_MAX_PX, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82 })
    .toBuffer();

  const meta = await sharp(thumbBuffer).metadata();
  return {
    buffer: thumbBuffer,
    width: meta.width ?? THUMB_MAX_PX,
    height: meta.height ?? THUMB_MAX_PX,
  };
}

import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

export async function generateVideoThumbnail(
  videoPath: string
): Promise<{ buffer: Buffer; width: number; height: number; originalWidth: number; originalHeight: number }> {
  const outPath = path.join(os.tmpdir(), `thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  
  try {
    await execFileAsync(ffmpegStatic as string, [
      "-i", videoPath,
      "-ss", "00:00:00.000",
      "-vframes", "1",
      "-q:v", "2",
      "-y", // overwrite output
      outPath,
    ]);

    const sharp = await loadSharp();
    const source = await fs.promises.readFile(outPath);
    const meta = await sharp(source).metadata();
    const originalWidth = meta.width ?? 0;
    const originalHeight = meta.height ?? 0;

    const thumb = await generateImageThumbnail(source);
    
    return {
      buffer: thumb.buffer,
      width: thumb.width,
      height: thumb.height,
      originalWidth,
      originalHeight,
    };
  } finally {
    if (fs.existsSync(outPath)) {
      await fs.promises.unlink(outPath).catch(() => {});
    }
  }
}

export async function getMediaDuration(filePath: string): Promise<number | null> {
  try {
    let output = "";
    try {
      const { stderr } = await execFileAsync(ffmpegStatic as string, ["-i", filePath]);
      output = stderr;
    } catch (err: any) {
      output = err.stderr || err.message || "";
    }

    const match = /Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d+)/.exec(output);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      const fracStr = match[4];
      const ms = parseInt((fracStr + "000").slice(0, 3), 10);
      return ((hours * 3600 + minutes * 60 + seconds) * 1000) + ms;
    }
  } catch (error) {
    console.error("Failed to extract media duration:", error);
  }
  return null;
}
