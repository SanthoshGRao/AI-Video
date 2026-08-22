import fs from "fs";
import path from "path";
import { Readable } from "stream";
import {
  filePath,
  parseStorageKey,
  STORAGE_ROOT,
  type StorageCategoryType,
} from "@/lib/storage/paths";

export type AssetRef = {
  localPath?: string | null;
  r2Key?: string | null;
  r2Url?: string | null;
};

/** Absolute path of an asset on local disk, if it is there. */
export function resolveLocalAssetPath(asset: AssetRef): string | null {
  // 1. Recorded absolute path — the common case for desktop and local dev.
  if (asset.localPath) {
    const normalized = path.normalize(asset.localPath);
    if (
      normalized.startsWith(path.normalize(STORAGE_ROOT)) &&
      fs.existsSync(normalized)
    ) {
      return normalized;
    }
  }

  // 2. Rebuild from the storage key. Survives a moved STORAGE_ROOT (which is
  //    exactly what happens when the desktop app relocates its userData dir),
  //    where the absolute localPath recorded at upload time is stale.
  if (asset.r2Key) {
    const parsed = parseStorageKey(asset.r2Key);
    if (parsed) {
      const rebuilt = filePath(
        parsed.category as StorageCategoryType,
        parsed.projectId,
        parsed.fileName
      );
      if (fs.existsSync(rebuilt)) return rebuilt;
    }
  }

  return null;
}

/**
 * A readable stream of the asset's bytes, wherever it lives — local disk or a
 * remote Blob URL. Returns null when the binary is simply gone, so export can
 * skip it and record the gap rather than aborting the whole bundle.
 */
export async function openAssetStream(
  asset: AssetRef
): Promise<{ stream: Readable; size: number | null } | null> {
  const local = resolveLocalAssetPath(asset);
  if (local) {
    const stat = fs.statSync(local);
    return { stream: fs.createReadStream(local), size: stat.size };
  }

  const url = asset.r2Url;
  if (url && /^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) return null;
      const len = res.headers.get("content-length");
      return {
        stream: Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
        size: len ? Number(len) : null,
      };
    } catch {
      return null;
    }
  }

  return null;
}

/** File extension for a bundled asset, preferring the original name. */
export function assetExtension(originalName: string | null, key: string | null): string {
  const fromName = originalName ? path.extname(originalName) : "";
  if (fromName) return fromName;
  const fromKey = key ? path.extname(key) : "";
  return fromKey || ".bin";
}
