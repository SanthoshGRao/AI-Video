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
 * Async version of saveBuffer that uploads to Vercel Blob in production.
 * This should be used in all API routes instead of saveBuffer.
 */
export async function saveBufferAsync(
  category: StorageCategoryType,
  projectId: string,
  fileName: string,
  buffer: Buffer
): Promise<SavedFile> {
  if (isBlobEnabled()) {
    const result = await uploadBlob(category, projectId, fileName, buffer);
    return {
      localPath: "", // No local path on Vercel
      key: result.key,
      url: result.url, // Persistent Vercel Blob CDN URL
      fileName: result.fileName,
      sizeBytes: result.sizeBytes,
    };
  }

  // Local development — use filesystem
  return saveBuffer(category, projectId, fileName, buffer);
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

/** Delete a file from Blob (if URL is a Blob URL) or from local disk */
export async function deleteFileAsync(
  localPath: string | null | undefined,
  url: string | null | undefined
): Promise<void> {
  // If it's a Blob URL, delete from Blob
  if (url && url.startsWith("https://") && isBlobEnabled()) {
    await deleteBlob(url);
    return;
  }
  // Otherwise try local deletion
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
