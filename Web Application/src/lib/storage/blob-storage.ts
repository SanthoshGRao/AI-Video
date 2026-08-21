import { put, del } from "@vercel/blob";
import type { StorageCategoryType } from "./paths";

/**
 * Whether Vercel Blob storage is available (production Vercel deployment).
 * Supports both token-based auth (BLOB_READ_WRITE_TOKEN) and
 * OIDC-based auth (BLOB_STORE_ID — auto-configured when linking Blob in Vercel dashboard).
 * Falls back to local filesystem when neither is configured (local dev).
 */
export function isBlobEnabled(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export interface BlobSaveResult {
  /** Public Vercel Blob URL (persistent, CDN-backed) */
  url: string;
  /** Logical storage key: category/projectId/fileName */
  key: string;
  /** Original file name */
  fileName: string;
  /** Size in bytes */
  sizeBytes: number;
}

/**
 * Upload a buffer to Vercel Blob under a structured path.
 * Returns a persistent CDN URL that works across serverless invocations.
 */
export async function uploadBlob(
  category: StorageCategoryType,
  projectId: string,
  fileName: string,
  buffer: Buffer,
  contentType?: string
): Promise<BlobSaveResult> {
  const pathname = `${category}/${projectId}/${fileName}`;

  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: contentType ?? guessMime(fileName),
    addRandomSuffix: false, // Keep predictable paths
  });

  return {
    url: blob.url,
    key: pathname,
    fileName,
    sizeBytes: buffer.length,
  };
}

/**
 * Delete a blob by its URL. Silently succeeds if the blob doesn't exist.
 */
export async function deleteBlob(blobUrl: string): Promise<void> {
  try {
    await del(blobUrl);
  } catch (error) {
    console.warn("[Blob] Failed to delete:", blobUrl, error);
  }
}

function guessMime(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    srt: "application/x-subrip",
    json: "application/json",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
