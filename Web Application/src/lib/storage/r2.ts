import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageCategoryType } from "./paths";

/**
 * Cloudflare R2 (S3-compatible) object storage — the actual cross-machine
 * shared storage for self-hosted deployments (desktop app, VPS). Without
 * this, `saveBufferAsync` only ever wrote to the local machine's own disk
 * outside of Vercel, so a workspace project's media/voiceover files never
 * existed anywhere but the machine that generated them — collaborators on
 * a different machine had a DB row pointing at a path that simply wasn't
 * there.
 */
export function isR2Enabled(): boolean {
  return !!(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY &&
    process.env.CLOUDFLARE_R2_SECRET_KEY &&
    process.env.CLOUDFLARE_R2_BUCKET &&
    process.env.CLOUDFLARE_R2_PUBLIC_URL
  );
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!,
    },
  });
  return client;
}

export interface R2SaveResult {
  /** Public URL (via the bucket's public domain/custom domain) */
  url: string;
  /** Logical storage key: category/projectId/fileName */
  key: string;
  fileName: string;
  sizeBytes: number;
}

export async function uploadToR2(
  category: StorageCategoryType,
  projectId: string,
  fileName: string,
  buffer: Buffer,
  contentType?: string
): Promise<R2SaveResult> {
  const key = `${category}/${projectId}/${fileName}`;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET!;
  const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, "");

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType ?? guessMime(fileName),
    })
  );

  return {
    url: `${publicUrlBase}/${key}`,
    key,
    fileName,
    sizeBytes: buffer.length,
  };
}

/** Delete an object by its logical storage key (category/projectId/fileName). */
export async function deleteFromR2(key: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: process.env.CLOUDFLARE_R2_BUCKET!, Key: key })
    );
  } catch (error) {
    console.warn("[R2] Failed to delete:", key, error);
  }
}

/** True when a URL was served from the configured R2 public base — as
 * opposed to a Vercel Blob URL or a local `/api/storage/...` path. */
export function isR2Url(url: string | null | undefined): boolean {
  if (!url) return false;
  const base = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  return !!base && url.startsWith(base.replace(/\/$/, ""));
}

function guessMime(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    srt: "application/x-subrip",
    json: "application/json",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
