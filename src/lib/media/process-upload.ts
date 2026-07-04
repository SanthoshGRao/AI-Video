import prisma from "@/lib/db/prisma";
import { saveBufferAsync, deleteLocalFile, deleteFileAsync } from "@/lib/storage/local";
import { StorageCategory, filePath, parseStorageKey } from "@/lib/storage/paths";
import { validateUploadFile, sanitizeFileName } from "@/lib/validations/upload";
import { serializeMediaAsset } from "@/lib/storage/serialize";
import { generateImageThumbnail, getImageDimensions, generateVideoThumbnail, getMediaDuration } from "@/lib/media/thumbnails";
import fs from "fs";
import path from "path";
import os from "os";


function uniqueFileName(ext: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

let warnedSharpUnavailable = false;

function logThumbnailError(kind: "image" | "video", error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Could not load the \"sharp\" module")) {
    if (!warnedSharpUnavailable) {
      warnedSharpUnavailable = true;
      console.warn("Sharp is unavailable; media will save without generated thumbnails.");
    }
    return;
  }

  console.error(`Failed to generate ${kind} thumbnail:`, error);
}

async function findExistingClientMedia(userId: string, clientId: string, projectId?: string) {
  return prisma.mediaAsset.findFirst({
    where: projectId ? { id: clientId, projectId } : { id: clientId, userId, projectId: null },
    include: { mediaTags: true },
  });
}

export async function processMediaUpload({
  userId,
  projectId,
  file,
  preferredId,
  thumbnailFile
}: {
  userId: string;
  projectId?: string;
  file: File;
  preferredId?: string | null;
  thumbnailFile?: File | null;
}) {
  const clientId = preferredId && /^[a-zA-Z0-9_-]{6,80}$/.test(preferredId) ? preferredId : null;
  if (clientId) {
    const existing = await findExistingClientMedia(userId, clientId, projectId);
    if (existing) return serializeMediaAsset(existing);
  }

  const folderId = projectId || userId;
  const { isVideo, isAudio, ext } = validateUploadFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = uniqueFileName(ext);
  const saved = await saveBufferAsync(StorageCategory.MEDIA, folderId, fileName, buffer);

  let tempFilePath: string | null = null;
  let mediaPath = saved.localPath;

  if (!mediaPath && (isVideo || isAudio)) {
    try {
      const tempName = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      tempFilePath = path.join(os.tmpdir(), tempName);
      await fs.promises.writeFile(tempFilePath, buffer);
      mediaPath = tempFilePath;
    } catch (e) {
      console.error("Failed to write temporary upload file for ffmpeg processing:", e);
    }
  }

  try {
    let width: number | undefined;
    let height: number | undefined;
    let thumbnailUrl: string | undefined;
    let thumbnailR2Key: string | undefined;
    let durationMs: number | undefined;

    if (mediaPath && (isVideo || isAudio)) {
      try {
        const duration = await getMediaDuration(mediaPath);
        if (duration !== null) {
          durationMs = duration;
        }
      } catch (err) {
        console.error("Failed to extract media duration:", err);
      }
    }

    if (!isAudio) {
      let thumbBuffer: Buffer | null = null;
      
      if (isVideo && mediaPath) {
        try {
          const thumb = await generateVideoThumbnail(mediaPath);
          thumbBuffer = thumb.buffer;
          width = thumb.originalWidth || undefined;
          height = thumb.originalHeight || undefined;
        } catch (err) {
          logThumbnailError("video", err);
        }
      } else {
        try {
          const dims = await getImageDimensions(buffer);
          width = dims.width || undefined;
          height = dims.height || undefined;
          const thumb = await generateImageThumbnail(buffer);
          thumbBuffer = thumb.buffer;
        } catch (err) {
          logThumbnailError("image", err);
        }
      }

      if (!thumbBuffer && thumbnailFile?.size) {
        try {
          thumbBuffer = Buffer.from(await thumbnailFile.arrayBuffer());
        } catch (err) {
          logThumbnailError("image", err);
        }
      }

      if (thumbBuffer) {
        const safeBase = sanitizeFileName(file.name).replace(/\.[^.]+$/, "");
        const thumbExt = thumbnailFile?.type === "image/png" ? "png" : "jpg";
        const thumbName = `thumb-${safeBase.slice(0, 40)}-${Date.now()}.${thumbExt}`;
        const thumbSaved = await saveBufferAsync(
          StorageCategory.THUMBNAILS,
          folderId,
          thumbName,
          thumbBuffer
        );
        thumbnailUrl = thumbSaved.url;
        thumbnailR2Key = thumbSaved.key;
      }
    }

    const data = {
      ...(clientId ? { id: clientId } : {}),
      userId,
      projectId: projectId || null,
      type: isVideo ? "VIDEO" as const : isAudio ? "DOCUMENT" as const : "IMAGE" as const,
      originalName: file.name,
      localPath: saved.localPath,
      r2Key: saved.key,
      r2Url: saved.url,
      thumbnailUrl,
      thumbnailR2Key,
      width,
      height,
      durationMs,
      fileSizeBytes: saved.sizeBytes,
      mimeType: file.type,
    };

    let mediaAsset;
    try {
      mediaAsset = await prisma.mediaAsset.create({
        data,
        include: { mediaTags: true },
      });
    } catch (error) {
      const isDuplicateClientId =
        clientId &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002";

      if (!isDuplicateClientId) throw error;

      deleteLocalFile(saved.localPath);
      if (thumbnailR2Key) {
        const parsed = parseStorageKey(thumbnailR2Key);
        if (parsed) deleteLocalFile(filePath(parsed.category, parsed.projectId, parsed.fileName));
      }

      const existing = await findExistingClientMedia(userId, clientId, projectId);
      if (existing) return serializeMediaAsset(existing);
      throw error;
    }

    return serializeMediaAsset(mediaAsset);
  } finally {
    if (tempFilePath) {
      fs.promises.unlink(tempFilePath).catch(() => {});
    }
  }
}

export function deleteMediaFiles(asset: {
  localPath?: string | null;
  r2Url: string;
  thumbnailR2Key?: string | null;
  thumbnailUrl?: string | null;
}): void {
  deleteLocalFile(asset.localPath);

  if (asset.thumbnailR2Key) {
    const parsed = parseStorageKey(asset.thumbnailR2Key);
    if (parsed) {
      deleteLocalFile(
        filePath(parsed.category, parsed.projectId, parsed.fileName)
      );
    }
  }
}
