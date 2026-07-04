import fs from "fs";
import path from "path";

/** Project root: ai-realestate-video/ */
export const PROJECT_ROOT = process.cwd();

/** Absolute path to /storage at project root */
export const STORAGE_ROOT = path.join(PROJECT_ROOT, "storage");

export const StorageCategory = {
  MEDIA: "media",
  AUDIO: "audio",
  SUBTITLES: "subtitles",
  EXPORTS: "exports",
  THUMBNAILS: "thumbnails",
  TEMP: "temp",
} as const;

export type StorageCategoryType =
  (typeof StorageCategory)[keyof typeof StorageCategory];

const CATEGORY_DIRS: StorageCategoryType[] = [
  StorageCategory.MEDIA,
  StorageCategory.AUDIO,
  StorageCategory.SUBTITLES,
  StorageCategory.EXPORTS,
  StorageCategory.THUMBNAILS,
  StorageCategory.TEMP,
];

/** Ensure /storage and all subdirectories exist */
export function ensureStorageTree(): void {
  for (const dir of [STORAGE_ROOT, ...CATEGORY_DIRS.map((c) => path.join(STORAGE_ROOT, c))]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/** Directory for a project under a category, e.g. storage/media/{projectId} */
export function projectDir(
  category: StorageCategoryType,
  projectId: string
): string {
  return path.join(STORAGE_ROOT, category, projectId);
}

/** Absolute path for a stored file */
export function filePath(
  category: StorageCategoryType,
  projectId: string,
  fileName: string
): string {
  return path.join(projectDir(category, projectId), fileName);
}

/** Relative key stored in DB (r2Key): category/projectId/fileName */
export function storageKey(
  category: StorageCategoryType,
  projectId: string,
  fileName: string
): string {
  return `${category}/${projectId}/${fileName}`;
}

/** Public URL served via authenticated API route */
export function publicUrl(
  category: StorageCategoryType,
  projectId: string,
  fileName: string
): string {
  return `/api/storage/${category}/${projectId}/${encodeURIComponent(fileName)}`;
}

/** Parse storage key back to parts */
export function parseStorageKey(key: string): {
  category: StorageCategoryType;
  projectId: string;
  fileName: string;
} | null {
  const parts = key.split("/");
  if (parts.length < 3) return null;
  const [category, projectId, ...rest] = parts;
  if (!CATEGORY_DIRS.includes(category as StorageCategoryType)) return null;
  return {
    category: category as StorageCategoryType,
    projectId,
    fileName: rest.join("/"),
  };
}

/** Verify resolved path stays inside STORAGE_ROOT (path traversal protection) */
export function assertInsideStorage(absolutePath: string): void {
  const normalized = path.normalize(absolutePath);
  const root = path.normalize(STORAGE_ROOT);
  if (!normalized.startsWith(root + path.sep) && normalized !== root) {
    throw new Error("Invalid storage path");
  }
}

/** True when running on Vercel (production or preview deployments) */
export function isVercelDeployment(): boolean {
  return !!process.env.VERCEL;
}
