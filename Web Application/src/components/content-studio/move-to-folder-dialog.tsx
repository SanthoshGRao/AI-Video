"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Folder, FolderPlus, ChevronRight, Home, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFolderPath } from "@/lib/media/use-folder-path";
import { CreateFolderDialog } from "@/components/content-studio/create-folder-dialog";
import type { FolderItem } from "@/lib/media/folder-types";
import { toast } from "sonner";

export function MoveToFolderDialog({
  open,
  onOpenChange,
  mediaIds,
  currentFolderId,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaIds: string[];
  currentFolderId: string | null;
  onMoved: (targetFolderId: string | null) => void;
}) {
  const [browsingFolderId, setBrowsingFolderId] = useState<string | null>(currentFolderId);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const { path } = useFolderPath(browsingFolderId);

  useEffect(() => {
    if (open) setBrowsingFolderId(currentFolderId);
  }, [open, currentFolderId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["media-folders-picker", browsingFolderId],
    queryFn: () =>
      fetch(`/api/media/folders?parentFolderId=${browsingFolderId ?? ""}`).then(
        (r) => r.json() as Promise<{ folders: FolderItem[] }>
      ),
    enabled: open,
  });
  const folders = data?.folders ?? [];

  const handleMove = async () => {
    setIsMoving(true);
    try {
      const res = await fetch("/api/media/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds, mediaFolderId: browsingFolderId }),
      });
      if (!res.ok) throw new Error("Failed to move");
      toast.success(mediaIds.length === 1 ? "File moved" : `${mediaIds.length} files moved`);
      onMoved(browsingFolderId);
    } catch {
      toast.error("Failed to move files");
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {mediaIds.length} item{mediaIds.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="flex items-center gap-1 text-xs text-slate-500 flex-wrap">
            {path.map((item, idx) => (
              <span key={item.id ?? "root"} className="flex items-center gap-1">
                <button
                  type="button"
                  className="hover:underline hover:text-slate-800"
                  onClick={() => setBrowsingFolderId(item.id)}
                >
                  {idx === 0 ? <Home className="w-3 h-3 inline mr-1" /> : null}
                  {item.name}
                </button>
                {idx < path.length - 1 && <ChevronRight className="w-3 h-3" />}
              </span>
            ))}
          </div>

          <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
            {isLoading ? (
              <p className="text-sm text-slate-500 p-4 text-center">Loading…</p>
            ) : folders.length === 0 ? (
              <p className="text-sm text-slate-500 p-4 text-center">No sub-folders</p>
            ) : (
              folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left"
                  onClick={() => setBrowsingFolderId(f.id)}
                >
                  <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              ))
            )}
          </div>
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateFolder(true)}>
            <FolderPlus className="w-4 h-4 mr-1.5" />
            New folder
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isMoving || browsingFolderId === currentFolderId}
            onClick={() => void handleMove()}
          >
            {isMoving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Move here
          </Button>
        </DialogFooter>

        <CreateFolderDialog
          open={showCreateFolder}
          onOpenChange={setShowCreateFolder}
          parentFolderId={browsingFolderId ?? undefined}
          onSuccess={() => void refetch()}
        />
      </DialogContent>
    </Dialog>
  );
}
