import { resolveAssetUrl } from "./local";
import { StorageCategory, parseStorageKey, publicUrl } from "./paths";

export function serializeMediaAsset<T extends {
  id: string;
  projectId?: string | null;
  localPath?: string | null;
  r2Url: string;
  r2Key: string;
  thumbnailUrl?: string | null;
  thumbnailR2Key?: string | null;
}>(asset: T): T & { r2Url: string; thumbnailUrl: string | null } {
  const parsedR2 = parseStorageKey(asset.r2Key);
  const r2Url = resolveAssetUrl(asset, {
    category: StorageCategory.MEDIA,
    projectId: parsedR2?.projectId || asset.projectId || "",
  });

  let thumbnailUrl: string | null = asset.thumbnailUrl ?? null;
  if (thumbnailUrl?.startsWith("/api/storage/")) {
    /* already resolved */
  } else if (asset.thumbnailR2Key) {
    const parsed = parseStorageKey(asset.thumbnailR2Key);
    if (parsed) {
      thumbnailUrl = publicUrl(
        parsed.category,
        parsed.projectId,
        parsed.fileName
      );
    }
  } else {
    thumbnailUrl = null;
  }

  return {
    ...asset,
    r2Url,
    thumbnailUrl,
  };
}

export function serializeAudioAsset<T extends {
  id: string;
  projectId?: string | null;
  localPath?: string | null;
  r2Url: string;
  r2Key: string;
}>(asset: T): T & { r2Url: string } {
  return {
    ...asset,
    r2Url: resolveAssetUrl(asset, {
      category: StorageCategory.AUDIO,
      projectId: asset.projectId || "",
    }),
  };
}
