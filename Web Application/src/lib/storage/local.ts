import fs from "fs";
import path from "path";
import {
  assertInsideStorage,
  ensureStorageTree,
  filePath,
  projectDir,
  publicUrl,
  storageKey,
  isVercelDeployment,
  type StorageCategoryType,
} from "./paths";
import { isBlobEnabled, uploadBlob, deleteBlob } from "./blob-storage";
import { isR2Enabled, uploadToR2, deleteFromR2, isR2Url } from "./r2";

export interface SavedFile {
  localPath: string;
  key: string;
  url: string;
  fileName: string;
  sizeBytes: number;
}

export function initStorage(): void {
  if (!isVercelDeployment()) {
    ensureStorageTree();
  }
}

/** Write buffer to local storage under category/projectId (local dev)
 *  or upload to Vercel Blob (production).
 *  Returns a SavedFile that can be persisted in the DB. */
export function saveBuffer(
  category: StorageCategoryType,
  projectId: string,
  fileName: string,
  buffer: Buffer
): SavedFile {
  // In production on Vercel with Blob configured → upload to Blob synchronously-ish
  // We need an async wrapper because Blob upload is async, but callers expect sync.
  // Solution: save locally as well in dev; in prod, we use saveBlobBuffer (async).
  // For backward compatibility, we save locally when possible and return the local URL.
  // The async Blob upload is handled by saveBlobBuffer() which should be preferred.
  if (!isVercelDeployment()) {
    initStorage();
    const dir = projectDir(category, projectId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const localPath = filePath(category, projectId, fileName);
    assertInsideStorage(localPath);
    fs.writeFileSync(localPath, buffer);

    return {
      localPath,
      key: storageKey(category, projectId, fileName),
      url: publicUrl(category, projectId, fileName),
      fileName,
      sizeBytes: buffer.length,
    };
  }

  // On Vercel without Blob (shouldn't happen with proper setup, but safe fallback)
  // Return the API URL path — the file won't persist but at least the shape is correct
  return {
    localPath: "",
    key: storageKey(category, projectId, fileName),
    url: publicUrl(category, projectId, fileName),
    fileName,
    sizeBytes: buffer.length,
  };
}

/**
 * Async version of saveBuffer that uploads to remote storage (R2 or Vercel
 * Blob) wherever one is configured. This should be used in all API routes
 * instead of saveBuffer.
 *
 * R2 is checked first: it's what makes a shared-workspace project's media
 * actually reachable from every machine's Postgres-shared DB row, whereas
 * plain local storage only ever exists on the machine that generated it.
 * A local copy is still written alongside it (except on Vercel, whose
 * filesystem outside /tmp is read-only) so the machine that just created the
 * asset doesn't need a round trip to read back what it made.
 */
export async function saveBufferAsync(
  category: StorageCategoryType,
  projectId: string,
  fileName: string,
  buffer: Buffer
): Promise<SavedFile> {
  let localPath = "";
  if (!isVercelDeployment()) {
    localPath = saveBuffer(category, projectId, fileName, buffer).localPath;
  }

  if (isR2Enabled()) {
    const result = await uploadToR2(category, projectId, fileName, buffer);
    return { localPath, key: result.key, url: result.url, fileName: result.fileName, sizeBytes: result.sizeBytes };
  }

  if (isBlobEnabled()) {
    const result = await uploadBlob(category, projectId, fileName, buffer);
    return { localPath, key: result.key, url: result.url, fileName: result.fileName, sizeBytes: result.sizeBytes };
  }

  // Neither remote store configured — local only (dev default).
  if (localPath) {
    return {
      localPath,
      key: storageKey(category, projectId, fileName),
      url: publicUrl(category, projectId, fileName),
      fileName,
      sizeBytes: buffer.length,
    };
  }
  return {
    localPath: "",
    key: storageKey(category, projectId, fileName),
    url: publicUrl(category, projectId, fileName),
    fileName,
    sizeBytes: buffer.length,
  };
}

/** Delete file by absolute localPath if it exists */
export function deleteLocalFile(localPath: string | null | undefined): void {
  if (!localPath) return;
  try {
    assertInsideStorage(localPath);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  } catch (e) {
    console.warn("deleteLocalFile:", e);
  }
}

/** Delete a file from R2, Blob (whichever the URL is from), and local disk */
export async function deleteFileAsync(
  localPath: string | null | undefined,
  url: string | null | undefined,
  key?: string | null | undefined
): Promise<void> {
  if (isR2Url(url) && key) {
    await deleteFromR2(key);
  } else if (url && url.startsWith("https://") && isBlobEnabled()) {
    await deleteBlob(url);
  }
  // Always also try local deletion — a local cache copy may exist alongside
  // a remote one (see saveBufferAsync).
  deleteLocalFile(localPath);
}

/** Delete legacy public/uploads file (backward compatibility) */
export function deleteLegacyPublicFile(publicUrlPath: string | null | undefined): void {
  if (!publicUrlPath?.startsWith("/uploads/")) return;
  const relative = publicUrlPath.replace(/^\/uploads\//, "");
  const full = path.join(process.cwd(), "public", "uploads", relative);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (e) {
    console.warn("deleteLegacyPublicFile:", e);
  }
}

/** Resolve playable URL for an asset (Blob URL, new storage API, or legacy /uploads) */
export function resolveAssetUrl(
  asset: {
    localPath?: string | null;
    r2Url: string;
    r2Key?: string;
  },
  fallback?: { category: StorageCategoryType; projectId: string }
): string {
  // Blob URLs are already publicly accessible — return directly
  if (asset.r2Url.startsWith("https://")) {
    return asset.r2Url;
  }
  if (asset.r2Url.startsWith("/api/storage/") || asset.r2Url.startsWith("/uploads/")) {
    return asset.r2Url;
  }
  if (asset.localPath && !isVercelDeployment() && fs.existsSync(asset.localPath) && fallback) {
    const fileName = path.basename(asset.localPath);
    return publicUrl(fallback.category, fallback.projectId, fileName);
  }
  if (asset.r2Key?.includes("/") && fallback) {
    const parts = asset.r2Key.split("/");
    const fileName = parts[parts.length - 1];
    return publicUrl(fallback.category, fallback.projectId, fileName);
  }
  return asset.r2Url;
}

/** Read file for streaming (must be inside storage or owned legacy path) */
export function readFileSafe(absolutePath: string): Buffer {
  assertInsideStorage(absolutePath);
  return fs.readFileSync(absolutePath);
}

/** Get MIME from extension */
export function mimeFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".srt": "application/x-subrip",
    ".ass": "text/plain",
    ".json": "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}
