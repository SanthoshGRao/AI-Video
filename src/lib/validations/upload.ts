import { z } from "zod";
import { badRequest } from "@/lib/api/errors";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_VIDEO_TYPES = ["video/mp4"] as const;

export const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/aac",
  "audio/mp3",
] as const;

export const ALLOWED_MEDIA_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_AUDIO_TYPES,
] as const;

const EXT_BY_MIME: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "audio/mpeg": [".mp3", ".mpeg"],
  "audio/mp3": [".mp3"],
  "audio/wav": [".wav"],
  "audio/aac": [".aac"],
};

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).flatMap(([mime, exts]) =>
    exts.map((ext) => [ext, mime])
  )
);

export function sanitizeFileName(originalName: string): string {
  const base = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return base || "file";
}

export function validateUploadFile(file: File): {
  isVideo: boolean;
  isAudio: boolean;
  ext: string;
} {
  const safeName = sanitizeFileName(file.name);
  const ext = safeName.includes(".")
    ? `.${safeName.split(".").pop()!.toLowerCase()}`
    : "";
  const mime = file.type || MIME_BY_EXT[ext] || "";
  if (!ALLOWED_MEDIA_TYPES.includes(mime as (typeof ALLOWED_MEDIA_TYPES)[number])) {
    throw badRequest(
      "Unsupported file type. Allowed: JPG, PNG, WebP, GIF, MP4, WebM, MOV, AVI, MKV, MP3, WAV."
    );
  }

  const isVideo = ALLOWED_VIDEO_TYPES.includes(
    mime as (typeof ALLOWED_VIDEO_TYPES)[number]
  );
  const isAudio = ALLOWED_AUDIO_TYPES.includes(
    mime as (typeof ALLOWED_AUDIO_TYPES)[number]
  );
  
  let maxBytes = MAX_IMAGE_BYTES;
  if (isVideo) maxBytes = MAX_VIDEO_BYTES;
  if (isAudio) maxBytes = MAX_VIDEO_BYTES; // Allow large audio files up to video size

  if (file.size > maxBytes) {
    throw badRequest(
      `File too large. Max ${maxBytes / (1024 * 1024)}MB.`
    );
  }

  if (file.size === 0) {
    throw badRequest("Empty file");
  }

  const resolvedExt = ext
    ? ext
    : isVideo
      ? ".mp4"
      : isAudio
        ? ".mp3"
        : ".jpg";

  const allowedExts = EXT_BY_MIME[mime];
  if (allowedExts && !allowedExts.includes(resolvedExt)) {
    throw badRequest(`File extension ${resolvedExt} does not match type ${mime}`);
  }

  return { isVideo, isAudio, ext: resolvedExt.replace(/^\./, "") };
}

export const voiceoverBodySchema = z.object({
  scriptVersionId: z.string().min(1),
  voicePersona: z.string().max(80).optional(),
  languageCode: z.string().max(12).optional(),
});

export const ttsBodySchema = z.object({
  scriptVersionId: z.string().min(1).optional(),
  text: z.string().min(1).max(5000),
  voiceType: z.string().max(80).optional(),
  languageCode: z.string().max(12).optional(),
});

export const refineScriptBodySchema = z.object({
  scriptVersionId: z.string().min(1),
  instruction: z.string().min(1).max(2000),
});

export const generateSocialBodySchema = z.object({
  scriptVersionId: z.string().min(1),
  prompt: z.string().max(2000).optional(),
});

export const generateScriptBodySchema = z.object({
  validatedFacts: z.record(z.string(), z.unknown()).optional(),
});
export const snapshotBodySchema = z.object({
  tab: z.string().max(50).optional(),
  selectedScriptId: z.string().nullable().optional(),
  isEditingDetails: z.boolean().optional(),
  editedRawText: z.string().max(50000).optional(),
  source: z.enum(["autosave", "manual", "pre_export"]).optional(),
});
