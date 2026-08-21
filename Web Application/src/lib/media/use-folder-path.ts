"use client";

import { useCallback, useEffect, useState } from "react";

export interface FolderPathItem {
  id: string | null;
  name: string;
}

const ROOT: FolderPathItem = { id: null, name: "Media Library" };

/** Walks up the folder tree from `folderId` to build a breadcrumb path. */
export function useFolderPath(folderId: string | null): {
  path: FolderPathItem[];
  isLoading: boolean;
} {
  const [path, setPath] = useState<FolderPathItem[]>([ROOT]);
  const [isLoading, setIsLoading] = useState(false);

  const build = useCallback(async (id: string | null) => {
    if (!id) {
      setPath([ROOT]);
      return;
    }
    setIsLoading(true);
    const acc: FolderPathItem[] = [];
    let current: string | null = id;
    try {
      while (current) {
        const res = await fetch(`/api/media/folders/${current}`);
        if (!res.ok) break;
        const { folder } = (await res.json()) as {
          folder: { id: string; name: string; parentFolderId: string | null };
        };
        acc.unshift({ id: folder.id, name: folder.name });
        current = folder.parentFolderId;
      }
    } finally {
      setPath([ROOT, ...acc]);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void build(folderId);
  }, [folderId, build]);

  return { path, isLoading };
}
