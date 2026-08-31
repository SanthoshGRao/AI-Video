/**
 * asset-cache.ts — resolves a MediaAsset/AudioAsset row to a real, local
 * file on THIS machine, even when its `localPath` was recorded by a
 * different machine.
 *
 * Workspace collaboration shares the Postgres database across machines
 * (see project memory), but never the files themselves: `localPath` is an
 * absolute path on whichever machine generated or imported the asset. When
 * a teammate opens the same project, that path doesn't exist on their disk.
 * `r2Url` (once R2 is configured — see Web Application/src/lib/storage/r2.ts)
 * is the asset's durable remote copy; this module downloads it on a cache
 * miss and keeps it under this machine's own storage tree so later opens
 * and exports are instant local reads.
 *
 * Only used where a real file on disk is required (ffmpeg-driven thumbnail
 * generation and export). The editor preview player doesn't need this — a
 * remote https URL can be handed to a <video>/<audio> element directly.
 */

import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { storagePath } from "../../config";

function cacheDir(): string {
  const dir = path.join(storagePath(), "remote-cache");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extFor(originalName: string | null | undefined, mimeType: string | null | undefined, urlHint: string): string {
  if (originalName) {
    const ext = path.extname(originalName);
    if (ext) return ext;
  }
  try {
    const ext = path.extname(new URL(urlHint).pathname);
    if (ext) return ext;
  } catch {
    /* urlHint wasn't a parseable URL — fall through */
  }
  const map: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
  };
  return (mimeType && map[mimeType]) || ".bin";
}

// Guards against two IPC calls (e.g. thumbnail + export) racing to download
// the same asset at once.
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Returns a path to a real file on this machine holding the asset's bytes,
 * downloading from `r2Url` into a local cache on a miss. Returns null only
 * when neither a valid local path nor a fetchable remote URL is available.
 */
export async function resolveAssetPath(
  assetId: string,
  localPath: string | null | undefined,
  r2Url: string | null | undefined,
  originalName?: string | null,
  mimeType?: string | null
): Promise<string | null> {
  if (localPath && fs.existsSync(localPath)) return localPath;
  if (!r2Url || !/^https?:\/\//i.test(r2Url)) return null;

  const dest = path.join(cacheDir(), `${assetId}${extFor(originalName, mimeType, r2Url)}`);
  if (fs.existsSync(dest)) return dest;

  const existing = inFlight.get(dest);
  if (existing) return existing;

  const download = (async (): Promise<string | null> => {
    const tmp = `${dest}.part-${process.pid}`;
    try {
      const res = await fetch(r2Url);
      if (!res.ok || !res.body) return null;
      await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
      fs.renameSync(tmp, dest);
      return dest;
    } catch (err) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* best-effort cleanup */
      }
      console.warn(`[asset-cache] Failed to download asset ${assetId} from remote storage:`, err);
      return null;
    } finally {
      inFlight.delete(dest);
    }
  })();

  inFlight.set(dest, download);
  return download;
}

/** Preview URL for the editor player — prefers a real local file (via the
 * `media://` protocol, wired up by the caller) and otherwise hands back the
 * remote URL directly, since <video>/<audio> can stream it without a
 * download step. Returns null only when neither is available. */
export function hasLocalCopy(localPath: string | null | undefined): localPath is string {
  return !!localPath && fs.existsSync(localPath);
}
