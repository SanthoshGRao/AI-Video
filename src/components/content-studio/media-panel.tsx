"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Trash2,
  ImageIcon,
  Film,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Tag,
  Plus,
  Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { useUIStore } from "@/stores/ui-store";
import { uploadProjectMedia, uploadGlobalMedia } from "@/lib/media/upload-client";
import { formatFileSize, MEDIA_ACCEPT } from "@/lib/media/utils";
import { cn } from "@/lib/utils";

type MediaTag = {
  id: string;
  tag: string;
  confidence?: number;
  source?: string;
};

export type MediaItem = {
  id: string;
  type: string;
  originalName: string;
  r2Url: string;
  thumbnailUrl?: string | null;
  mimeType: string;
  fileSizeBytes: number;
  width?: number | null;
  height?: number | null;
  mediaTags?: MediaTag[];
};

function normalizeMediaTags(raw: unknown): MediaTag[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      id: String(t.id ?? t.tag),
      tag: String(t.tag ?? ""),
      confidence: typeof t.confidence === "number" ? t.confidence : undefined,
      source: typeof t.source === "string" ? t.source : undefined,
    }))
    .filter((t) => t.tag.length > 0);
}

type FilterType = "all" | "image" | "video";

type QueueItem = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

function filterMedia(
  items: MediaItem[],
  query: string,
  filter: FilterType
): MediaItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filter === "image" && item.type !== "IMAGE") return false;
    if (filter === "video" && item.type !== "VIDEO") return false;
    if (!q) return true;
    return item.originalName.toLowerCase().includes(q);
  });
}

export function MediaPanel({ projectId, readOnly }: { projectId?: string, readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | "all" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: projectId ? ["project-media", projectId] : ["global-media"],
    queryFn: () =>
      fetch(projectId ? `/api/projects/${projectId}/media` : `/api/media`).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json() as Promise<{ media: MediaItem[] }>;
      }),
  });

  const media = useMemo(
    () =>
      (data?.media ?? []).map((m) => ({
        ...m,
        mediaTags: normalizeMediaTags(m.mediaTags),
      })),
    [data?.media]
  );
  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();
    for (const m of media) {
      m.mediaTags?.forEach((t) => tags.add(t.tag));
    }
    return Array.from(tags).sort();
  }, [media]);

  const filtered = useMemo(
    () => filterMedia(media, search, filter),
    [media, search, filter]
  );

  const analyzeAll = async () => {
    setAnalyzing("all");
    try {
      const res = await fetch(projectId ? `/api/projects/${projectId}/media/analyze` : `/api/media/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analysis failed");
      invalidateMedia();
      addToast({
        type: "success",
        title: `Analyzed ${json.analyzed?.length ?? 0} file(s)`,
        description:
          json.errors?.length > 0
            ? `${json.errors.length} failed`
            : undefined,
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "AI analysis failed",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setAnalyzing(null);
    }
  };

  const analyzeOne = async (mediaId: string) => {
    setAnalyzing(mediaId);
    try {
      const res = await fetch(
        projectId ? `/api/projects/${projectId}/media/${mediaId}/analyze` : `/api/media/${mediaId}/analyze`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analysis failed");
      invalidateMedia();
      addToast({ type: "success", title: "Tags updated" });
    } catch (e) {
      addToast({
        type: "error",
        title: "Analysis failed",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setAnalyzing(null);
    }
  };

  const addManualTag = async (mediaId: string, tag: string) => {
    const res = await fetch(projectId ? `/api/projects/${projectId}/media/${mediaId}/tags` : `/api/media/${mediaId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || "Could not add tag");
    }
    invalidateMedia();
  };

  const removeTag = async (mediaId: string, tagId: string) => {
    const res = await fetch(
      projectId ? `/api/projects/${projectId}/media/${mediaId}/tags?tagId=${tagId}` : `/api/media/${mediaId}/tags?tagId=${tagId}`,
      { method: "DELETE" }
    );
    if (!res.ok) throw new Error("Could not remove tag");
    invalidateMedia();
  };

  const renameMedia = async (mediaId: string, newName: string) => {
    const res = await fetch(
      projectId ? `/api/projects/${projectId}/media` : `/api/media`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mediaId, name: newName }),
      }
    );
    if (!res.ok) {
      addToast({ type: "error", title: "Could not rename file" });
      return;
    }
    invalidateMedia();
    addToast({ type: "success", title: "File renamed" });
  };

  const batchToastRef = useRef<{ success: number; error: boolean }>({
    success: 0,
    error: false,
  });

  const isUploading = queue.some(
    (q) => q.status === "uploading" || q.status === "pending"
  );

  const invalidateMedia = useCallback(() => {
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: ["project-media", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    } else {
      queryClient.invalidateQueries({ queryKey: ["global-media"] });
    }
  }, [projectId, queryClient]);

  const enqueueFiles = useCallback((fileList: FileList | File[] | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    
    let hasDuplicates = false;
    let duplicateName = "";

    setQueue((prev) => {
      const newItems: QueueItem[] = [];
      for (const file of files) {
        const inQueue = prev.some((q) => q.file.name === file.name && q.file.size === file.size);
        const inMedia = media.some((m) => m.originalName === file.name && m.fileSizeBytes === file.size);
        
        if (!inQueue && !inMedia) {
          newItems.push({
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
            file,
            status: "pending",
            progress: 0,
          });
        } else {
          hasDuplicates = true;
          duplicateName = file.name;
        }
      }
      return [...prev, ...newItems];
    });

    if (hasDuplicates) {
      setTimeout(() => {
        addToast({ type: "error", title: "Duplicate file skipped", description: `${duplicateName} is already uploaded or in queue.` });
      }, 0);
    }
  }, [media, addToast]);

  useEffect(() => {
    const uploading = queue.some((q) => q.status === "uploading");
    if (uploading) return;

    const next = queue.find((q) => q.status === "pending");
    if (!next) {
      const { success, error } = batchToastRef.current;
      if (success > 0) {
        invalidateMedia();
        addToast({
          type: "success",
          title:
            success === 1 ? "1 file uploaded" : `${success} files uploaded`,
        });
      }
      if (error) {
        addToast({
          type: "error",
          title: "Some uploads failed",
          description: "See the queue for details.",
        });
      }
      if (success > 0 || error) {
        batchToastRef.current = { success: 0, error: false };
        setQueue((prev) => prev.filter((q) => q.status !== "done"));
        setTimeout(() => {
          setQueue((prev) => prev.filter((q) => q.status !== "error"));
        }, 5000);
      }
      return;
    }

    (async () => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === next.id ? { ...q, status: "uploading", progress: 0 } : q
        )
      );

      try {
        if (!projectId) {
          await uploadGlobalMedia(next.file, (pct) => {
            setQueue((prev) =>
              prev.map((q) => (q.id === next.id ? { ...q, progress: pct } : q))
            );
          });
        } else {
          await uploadProjectMedia(projectId, next.file, (pct) => {
            setQueue((prev) =>
              prev.map((q) => (q.id === next.id ? { ...q, progress: pct } : q))
            );
          });
        }
        
        batchToastRef.current.success += 1;
        setQueue((prev) =>
          prev.map((q) =>
            q.id === next.id ? { ...q, status: "done", progress: 100 } : q
          )
        );
      } catch (e) {
        batchToastRef.current.error = true;
        const message = e instanceof Error ? e.message : "Upload failed";
        setQueue((prev) =>
          prev.map((q) =>
            q.id === next.id
              ? { ...q, status: "error", error: message, progress: 0 }
              : q
          )
        );
      }
    })();
  }, [queue, projectId, invalidateMedia, addToast]);



  const remove = async (mediaId: string) => {
    const res = await fetch(
      projectId ? `/api/projects/${projectId}/media?mediaId=${mediaId}` : `/api/media?mediaId=${mediaId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      addToast({ type: "error", title: "Could not delete file" });
      return;
    }
    addToast({ type: "success", title: "File removed" });
    invalidateMedia();
  };

  const clearQueue = () => setQueue([]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between bg-slate-50/50 p-4 rounded-xl border border-slate-100">
        {media.length > 0 ? (
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by filename…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9 bg-white"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {(
                [
                  ["all", "All"],
                  ["image", "Photos"],
                  ["video", "Videos"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={filter === value ? "default" : "outline"}
                  className={cn("h-9", filter !== value && "bg-white")}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  {value !== "all" && (
                    <span className="ml-1.5 opacity-70 text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
                      {
                        media.filter((m) =>
                          value === "image"
                            ? m.type === "IMAGE"
                            : m.type === "VIDEO"
                        ).length
                      }
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 text-sm text-slate-500 flex items-center">
            Upload some photos or videos to get started.
          </div>
        )}

        {!readOnly && (
          <div className="shrink-0 flex items-center">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple
              accept={MEDIA_ACCEPT}
              onChange={(e) => {
                enqueueFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white h-9 shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Upload Media
            </Button>
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Upload queue</p>
              <Button
                type="button"
                variant="secondary"
                className="h-8 text-xs"
                onClick={clearQueue}
                disabled={isUploading}
              >
                Clear
              </Button>
            </div>
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {queue.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 text-xs border border-slate-100 rounded-lg px-3 py-2 bg-slate-50/80"
                >
                  {item.status === "uploading" && (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin text-indigo-600" />
                  )}
                  {item.status === "done" && (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  )}
                  {item.status === "error" && (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  )}
                  {item.status === "pending" && (
                    <div className="w-4 h-4 shrink-0 rounded-full border-2 border-slate-300" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {item.file.name}
                    </p>
                    <p className="text-slate-500">
                      {formatFileSize(item.file.size)}
                      {item.status === "uploading" && ` · ${item.progress}%`}
                      {item.error && ` · ${item.error}`}
                    </p>
                    {item.status === "uploading" && (
                      <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-150"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}





      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : media.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-4">
          No media yet. Upload property photos or video clips above.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-4">
          No files match your search or filter.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Showing {filtered.length} of {media.length} file
            {media.length === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {filtered.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                analyzing={analyzing === item.id}
                readOnly={readOnly}
                onRemove={remove}
                onAnalyze={() => void analyzeOne(item.id)}
                onAddTag={(tag) => void addManualTag(item.id, tag)}
                onRemoveTag={(tagId) => void removeTag(item.id, tagId)}
                onRename={(name) => void renameMedia(item.id, name)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MediaCard({
  item,
  analyzing,
  onRemove,
  onAnalyze,
  onAddTag,
  onRemoveTag,
  onRename,
  readOnly,
}: {
  item: MediaItem;
  analyzing?: boolean;
  onRemove: (id: string) => void;
  onAnalyze: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tagId: string) => void;
  onRename: (name: string) => void;
  readOnly?: boolean;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(item.originalName);
  
  const previewSrc =
    item.thumbnailUrl ??
    (item.type === "IMAGE" ? item.r2Url : undefined);

  return (
    <Card className="overflow-hidden group shadow-sm">
      <div className="aspect-video bg-slate-100 relative">
        {item.type === "VIDEO" ? (
          <video
            src={item.r2Url || undefined}
            className="w-full h-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc || undefined}
            alt={item.originalName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-slate-300" />
          </div>
        )}
        {!readOnly && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="p-1.5 rounded-lg bg-white/90 shadow hover:bg-rose-50"
            aria-label="Remove file"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
          </button>
        </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          {item.type === "VIDEO" ? (
            <Film className="w-4 h-4 text-white drop-shadow" />
          ) : (
            <ImageIcon className="w-4 h-4 text-white drop-shadow" />
          )}
        </div>
        {item.type === "VIDEO" && (
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 normal-case tracking-normal text-[10px] py-0 px-1.5 bg-black/50 text-white border-0"
          >
            Video
          </Badge>
        )}
      </div>
      <CardContent className="p-2 space-y-1">
        <div className="flex items-center justify-between gap-1 group/title h-5">
          {isEditingName ? (
            <input
              type="text"
              autoFocus
              className="text-[10px] w-full px-1 py-0.5 border rounded outline-none font-medium"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => {
                setIsEditingName(false);
                if (editName.trim() && editName.trim() !== item.originalName) {
                  onRename(editName.trim());
                } else {
                  setEditName(item.originalName);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditingName(false);
                  if (editName.trim() && editName.trim() !== item.originalName) {
                    onRename(editName.trim());
                  } else {
                    setEditName(item.originalName);
                  }
                } else if (e.key === "Escape") {
                  setIsEditingName(false);
                  setEditName(item.originalName);
                }
              }}
            />
          ) : (
            <>
              <p
                className="text-[10px] text-slate-600 truncate font-medium cursor-text"
                onDoubleClick={() => !readOnly && setIsEditingName(true)}
                title={item.originalName}
              >
                {item.originalName}
              </p>
              {!readOnly && (
                <button
                  type="button"
                  className="opacity-0 group-hover/title:opacity-100 p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-opacity"
                  onClick={() => setIsEditingName(true)}
                  aria-label="Rename"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              )}
            </>
          )}
        </div>
        <p className="text-[10px] text-slate-400">
          {formatFileSize(item.fileSizeBytes)}
          {item.width && item.height
            ? ` · ${item.width}×${item.height}`
            : ""}
        </p>

      </CardContent>
    </Card>
  );
}
