/**
 * thumbnail-gen.ts — generates a cached JPEG thumbnail for a media asset
 * via a single short-lived ffmpeg process, run in the main process. Used
 * by the AssetPanel so the editor shows real preview frames instead of a
 * text-only list.
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getCapabilities } from "../export/ffmpeg-locate";
import { storagePath } from "../../config";

const THUMB_WIDTH = 256;

function thumbnailsDir(): string {
  const dir = path.join(storagePath(), "thumbnails");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function thumbnailPathFor(mediaAssetId: string): string {
  return path.join(thumbnailsDir(), `${mediaAssetId}.jpg`);
}

/** Returns the cached thumbnail path, generating it on a cache miss. */
export async function getOrGenerateThumbnail(
  mediaAssetId: string,
  sourcePath: string,
  isVideo: boolean,
  durationMs: number | null
): Promise<string> {
  const outputPath = thumbnailPathFor(mediaAssetId);
  if (fs.existsSync(outputPath)) return outputPath;

  const { ffmpegPath } = await getCapabilities();
  const seekSec = isVideo ? Math.min(1, (durationMs ?? 2000) / 1000 / 10) : 0;

  const args = isVideo
    ? ["-y", "-ss", seekSec.toFixed(2), "-i", sourcePath, "-frames:v", "1", "-vf", `scale=${THUMB_WIDTH}:-1`, outputPath]
    : ["-y", "-i", sourcePath, "-vf", `scale=${THUMB_WIDTH}:-1`, outputPath];

  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Thumbnail generation failed (${code}): ${stderr.slice(-500)}`));
    });
  });

  return outputPath;
}
