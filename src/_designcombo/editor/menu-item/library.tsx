import { ADD_IMAGE, ADD_VIDEO } from "@designcombo/state";
import { dispatch } from "@designcombo/events";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Library as LibraryIcon,
  Loader2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { generateId } from "@designcombo/timeline";
import Draggable from "@/_designcombo/shared/draggable";
import { useIsDraggingOverTimeline } from "../hooks/is-dragging-over-timeline";
import {
  buildImageDragPayload,
  buildVideoDragPayload,
} from "../utils/drag-payloads";
import { useQuery } from "@tanstack/react-query";
import type { MediaItem } from "@/components/content-studio/media-panel";

type AddableAsset = { id?: string; url: string; metadata?: { uploadedUrl?: string } };

export const LibraryPanel = () => {
  const isDraggingOverTimeline = useIsDraggingOverTimeline();
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["global-media"],
    queryFn: () =>
      fetch(`/api/media`).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json() as Promise<{ media: MediaItem[] }>;
      }),
  });

  const libraryMedia = useMemo(() => {
    const items = data?.media ?? [];
    if (!query.trim()) return items;
    const needle = query.toLowerCase();
    return items.filter(
      (m) =>
        m.originalName.toLowerCase().includes(needle) ||
        m.type.toLowerCase().includes(needle) ||
        m.mediaTags?.some((t) => t.tag.toLowerCase().includes(needle))
    );
  }, [data?.media, query]);

  const libraryVideos = libraryMedia.filter((m) => m.type === "VIDEO");
  const libraryImages = libraryMedia.filter((m) => m.type === "IMAGE");

  const handleAddVideo = (video: AddableAsset) => {
    const srcVideo = video.metadata?.uploadedUrl || video.url;

    dispatch(ADD_VIDEO, {
      payload: {
        id: generateId(),
        details: {
          src: srcVideo
        },
        metadata: {
          previewUrl: srcVideo,
          mediaAssetId: video.id,
        }
      },
      options: {
        resourceId: "main",
        scaleMode: "fit"
      }
    });
  };

  const handleAddImage = (image: AddableAsset) => {
    const srcImage = image.metadata?.uploadedUrl || image.url;

    dispatch(ADD_IMAGE, {
      payload: {
        id: generateId(),
        type: "image",
        display: {
          from: 0,
          to: 5000
        },
        details: {
          src: srcImage
        },
        metadata: { mediaAssetId: image.id }
      },
      options: { scaleMode: "fit" }
    });
  };

  const noUploads = !isLoading && libraryMedia.length === 0;

  return (
    <div data-testid="panel-library" className="flex min-h-0 flex-1 flex-col bg-[#f8fafc]">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Library</h2>
            <p className="text-[11px] text-slate-500">Your global media library.</p>
          </div>
        </div>
      </div>

      <div className="p-4 pb-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search global media"
          className="h-9 bg-white"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      )}

      {noUploads && (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          <LibraryIcon size={32} className="opacity-50" />
          <span className="text-sm">
            {data?.media?.length === 0 ? "No media in Library" : "No matches found"}
          </span>
          {data?.media?.length === 0 && (
            <span className="text-xs text-center px-4 mt-2">
              Add media to your library from the Dashboard to access it across all projects.
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-4 pt-2">
        {libraryMedia.length > 0 && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Global assets</div>
            </div>

            {libraryVideos.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <VideoIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Videos</span>
                </div>
                <MediaGrid
                  media={libraryVideos}
                  isDraggingOverTimeline={isDraggingOverTimeline}
                  onVideo={handleAddVideo}
                  onImage={handleAddImage}
                />
              </div>
            )}

            {libraryImages.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Images</span>
                </div>
                <MediaGrid
                  media={libraryImages}
                  isDraggingOverTimeline={isDraggingOverTimeline}
                  onVideo={handleAddVideo}
                  onImage={handleAddImage}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function MediaGrid({
  media,
  isDraggingOverTimeline,
  onVideo,
  onImage,
}: {
  media: MediaItem[];
  isDraggingOverTimeline: boolean;
  onVideo: (video: AddableAsset) => void;
  onImage: (image: AddableAsset) => void;
}) {
  return (
    <ScrollArea className="max-h-64">
      <div className="grid grid-cols-3 gap-2 max-w-full">
        {media.map((m) => {
          const isVideo = m.type === "VIDEO";
          const thumb = m.thumbnailUrl || m.r2Url;
          const dragData = isVideo
            ? {
                ...buildVideoDragPayload(m.r2Url, thumb),
                metadata: { previewUrl: thumb, mediaAssetId: m.id },
              }
            : {
                ...buildImageDragPayload(m.r2Url),
                metadata: { mediaAssetId: m.id },
              };
          return (
            <Draggable
              key={m.id}
              data={dragData}
              shouldDisplayPreview={!isDraggingOverTimeline}
              renderCustomPreview={<div style={{ backgroundImage: `url(${thumb})`, backgroundSize: "cover", width: 72, height: 72 }} className="rounded-md" />}
            >
              <div className="flex flex-col items-center gap-1 w-full">
                <Card
                  className="w-16 h-16 overflow-hidden relative cursor-grab active:cursor-grabbing"
                  onClick={() => {
                    return isVideo
                      ? onVideo({ id: m.id, url: m.r2Url, metadata: { uploadedUrl: m.r2Url } })
                      : onImage({ id: m.id, url: m.r2Url, metadata: { uploadedUrl: m.r2Url } });
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb} alt={m.originalName} draggable={false} className="h-full w-full object-cover pointer-events-none" />
                </Card>
                <div className="text-xs text-muted-foreground truncate w-full text-center">
                  {m.originalName}
                </div>
              </div>
            </Draggable>
          );
        })}
      </div>
    </ScrollArea>
  );
}
