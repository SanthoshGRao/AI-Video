import { ADD_AUDIO, ADD_IMAGE, ADD_VIDEO } from "@designcombo/state";
import { dispatch } from "@designcombo/events";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Star,
  Search,
  Music,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  UploadIcon,
  Upload,
  Trash2
} from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { generateId } from "@designcombo/timeline";
import { Button } from "@/components/ui/button";
import useUploadStore from "../store/use-upload-store";
import ModalUpload from "@/components/modal-upload";
import { useProjectEditor } from "../context/project-editor-context";
import Draggable from "@/_designcombo/shared/draggable";
import { useIsDraggingOverTimeline } from "../hooks/is-dragging-over-timeline";
import {
  buildImageDragPayload,
  buildVideoDragPayload,
  buildAudioDragPayload,
} from "../utils/drag-payloads";

type UploadAsset = {
  id?: string;
  url?: string;
  type?: string;
  file?: { name?: string };
  metadata?: { uploadedUrl?: string };
  progress?: number;
  status?: string;
};

type AddableAsset = { id?: string; url: string; metadata?: { uploadedUrl?: string } };

export const Uploads = () => {
  const projectEditor = useProjectEditor();
  const isDraggingOverTimeline = useIsDraggingOverTimeline();
  const [query, setQuery] = useState("");
  const [deletedProjectMediaIds, setDeletedProjectMediaIds] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("editor-favorite-assets") ?? "[]");
    } catch {
      return [];
    }
  });
  const { setShowUploadModal, uploads, pendingUploads, activeUploads, deleteUpload } =
    useUploadStore();

  // Group completed uploads by type
  const videos = uploads.filter(
    (upload) => upload.type?.startsWith("video/") || upload.type === "video"
  );
  const images = uploads.filter(
    (upload) => upload.type?.startsWith("image/") || upload.type === "image"
  );
  const audios = uploads.filter(
    (upload) => upload.type?.startsWith("audio/") || upload.type === "audio"
  );

  const rememberAsset = (id: string) => {
    if (typeof window === "undefined") return;
    const previous = JSON.parse(localStorage.getItem("editor-recent-assets") ?? "[]") as string[];
    localStorage.setItem("editor-recent-assets", JSON.stringify([id, ...previous.filter((x) => x !== id)].slice(0, 8)));
  };

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [id, ...favorites];
    setFavorites(next);
    localStorage.setItem("editor-favorite-assets", JSON.stringify(next));
  };

  const projectMedia = useMemo(() => {
    const items = projectEditor?.media ?? [];
    if (!query.trim()) return items;
    const needle = query.toLowerCase();
    return items.filter((m) => m.originalName.toLowerCase().includes(needle) || m.type.toLowerCase().includes(needle));
  }, [projectEditor?.media, query]);
  const visibleProjectMedia = projectMedia.filter(
    (m) => !deletedProjectMediaIds.includes(m.id)
  );
  const projectVideos = visibleProjectMedia.filter((m) => m.type === "VIDEO");
  const projectImages = visibleProjectMedia.filter((m) => m.type === "IMAGE");

  const favoriteMedia = projectMedia.filter((m) => favorites.includes(m.id));
  let recentIds: string[] = [];
  if (typeof window !== "undefined") {
    try {
      recentIds = JSON.parse(localStorage.getItem("editor-recent-assets") ?? "[]") as string[];
    } catch {
      recentIds = [];
    }
  }
  const recentMedia = recentIds.map((id) => projectMedia.find((m) => m.id === id)).filter(Boolean).slice(0, 6) as typeof projectMedia;

  const handleDeleteProjectMedia = async (mediaId: string) => {
    if (!projectEditor?.projectId) return;
    setDeletedProjectMediaIds((current) => [...current, mediaId]);
    try {
      const res = await fetch(
        `/api/projects/${projectEditor.projectId}/media?mediaId=${encodeURIComponent(mediaId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error("Failed to delete media");
      }
      useUploadStore
        .getState()
        .setUploads((prev) => prev.filter((item: any) => item.id !== mediaId));
    } catch {
      setDeletedProjectMediaIds((current) => current.filter((id) => id !== mediaId));
    }
  };

  const handleAddVideo = (video: AddableAsset | UploadAsset) => {
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

  const handleAddImage = (image: AddableAsset | UploadAsset) => {
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

  const handleAddAudio = (audio: AddableAsset | UploadAsset) => {
    const srcAudio = audio.metadata?.uploadedUrl || audio.url;
    dispatch(ADD_AUDIO, {
      payload: {
        id: generateId(),
        type: "audio",
        details: {
          src: srcAudio
        },
        metadata: { mediaAssetId: audio.id }
      },
      options: {}
    });
  };

  const noUploads =
    pendingUploads.length === 0 &&
    activeUploads.length === 0 &&
    videos.length === 0 &&
    images.length === 0 &&
    audios.length === 0 &&
    visibleProjectMedia.length === 0;
  return (
    <div data-testid="panel-uploads" className="flex min-h-0 flex-1 flex-col bg-[#f8fafc]">
      <ModalUpload />
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Uploads</h2>
            <p className="text-[11px] text-slate-500">Add photos, videos, and audio to your design.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-4 pb-2">
        <Button
          className="w-full cursor-pointer rounded-xl border-slate-300 bg-white font-semibold hover:bg-slate-50"
          onClick={() => setShowUploadModal(true)}
          variant="outline"
        >
          <UploadIcon className="w-4 h-4" />
          <span className="ml-2">Upload</span>
        </Button>
      </div>

      <div className="px-4 pb-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search project media"
          className="h-9 bg-white"
        />
      </div>

      {noUploads && (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          <Upload size={32} className="opacity-50" />
          <span className="text-sm">
            {uploads.length === 0 ? "No uploads yet" : "No matches found"}
          </span>
        </div>
      )}

      {/* Uploads in Progress Section */}
      {(pendingUploads.length > 0 || activeUploads.length > 0) && (
        <div className="p-4">
          <div className="font-medium text-sm mb-2 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            Uploads in Progress
          </div>
          <div className="flex flex-col gap-2">
            {pendingUploads.map((upload) => (
              <div key={upload.id} className="flex items-center gap-2">
                <span className="truncate text-xs flex-1">
                  {upload.file?.name || upload.url || "Unknown"}
                </span>
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
            ))}
            {activeUploads.map((upload) => (
              <div key={upload.id} className="flex items-center gap-2">
                <span className="truncate text-xs flex-1">
                  {upload.file?.name || upload.url || "Unknown"}
                </span>
                <div className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  <span className="text-xs">{upload.progress ?? 0}%</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {upload.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-4 pt-2">
        {visibleProjectMedia.length > 0 && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Project library</div>
              <div className="text-[11px] text-slate-500">Persisted assets available after reload.</div>
            </div>

            {projectVideos.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <VideoIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Saved videos</span>
                </div>
                <MediaGrid
                  media={projectVideos}
                  favorites={favorites}
                  onFavorite={toggleFavorite}
                  onRemember={rememberAsset}
                  isDraggingOverTimeline={isDraggingOverTimeline}
                  onVideo={handleAddVideo}
                  onImage={handleAddImage}
                  onDelete={handleDeleteProjectMedia}
                />
              </div>
            )}

            {projectImages.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Saved images</span>
                </div>
                <MediaGrid
                  media={projectImages}
                  favorites={favorites}
                  onFavorite={toggleFavorite}
                  onRemember={rememberAsset}
                  isDraggingOverTimeline={isDraggingOverTimeline}
                  onVideo={handleAddVideo}
                  onImage={handleAddImage}
                  onDelete={handleDeleteProjectMedia}
                />
              </div>
            )}
          </div>
        )}



        {/* Videos Section */}
        {videos.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <VideoIcon className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Videos</span>
            </div>
            <ScrollArea className="max-h-32">
              <div className="grid grid-cols-3 gap-2 max-w-full">
                {videos.map((video, idx) => {
                  const vidSrc = video.metadata?.uploadedUrl || video.url || (video as any).r2Url || "";
                  const dragData = {
                    ...buildVideoDragPayload(vidSrc, vidSrc),
                    metadata: { previewUrl: vidSrc, mediaAssetId: video.id },
                  };
                  return (
                    <Draggable
                      key={video.id || idx}
                      data={dragData}
                      shouldDisplayPreview={!isDraggingOverTimeline}
                      renderCustomPreview={<div style={{ backgroundImage: `url(${vidSrc})`, backgroundSize: "cover", width: 72, height: 72 }} className="rounded-md" />}
                    >
                      <div
                        className="flex items-center gap-2 flex-col w-full relative group"
                      >
                        <Card
                          className="w-16 h-16 flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing bg-slate-100"
                          onClick={() => handleAddVideo(video)}
                        >
                          {vidSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <video src={vidSrc} className="h-full w-full object-cover pointer-events-none" />
                          ) : (
                            <VideoIcon className="w-8 h-8 text-muted-foreground" />
                          )}
                        </Card>
                        <button
                          type="button"
                          className="absolute right-0 top-0 z-10 hidden group-hover:flex rounded-full bg-black/60 p-1 text-white hover:bg-red-500 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (video.id) deleteUpload(video.id);
                          }}
                          title="Delete upload"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <div className="text-xs text-muted-foreground truncate w-full text-center">
                          {video.file?.name || video.url || "Video"}
                        </div>
                      </div>
                    </Draggable>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Images Section */}
        {images.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Images</span>
            </div>
            <ScrollArea className="max-h-32">
              <div className="grid grid-cols-3 gap-2 max-w-full">
                {images.map((image, idx) => {
                  const imgSrc = image.metadata?.uploadedUrl || image.url || (image as any).r2Url || "";
                  const dragData = {
                    ...buildImageDragPayload(imgSrc),
                    metadata: { mediaAssetId: image.id },
                  };
                  return (
                    <Draggable
                      key={image.id || idx}
                      data={dragData}
                      shouldDisplayPreview={!isDraggingOverTimeline}
                      renderCustomPreview={<div style={{ backgroundImage: `url(${imgSrc})`, backgroundSize: "cover", width: 72, height: 72 }} className="rounded-md" />}
                    >
                      <div
                        className="flex items-center gap-2 flex-col w-full relative group"
                      >
                        <Card
                          className="w-16 h-16 flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing bg-slate-100"
                          onClick={() => handleAddImage(image)}
                        >
                          {imgSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imgSrc} alt="" className="h-full w-full object-cover pointer-events-none" draggable={false} />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-muted-foreground" />
                          )}
                        </Card>
                        <button
                          type="button"
                          className="absolute right-0 top-0 z-10 hidden group-hover:flex rounded-full bg-black/60 p-1 text-white hover:bg-red-500 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (image.id) deleteUpload(image.id);
                          }}
                          title="Delete upload"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <div className="text-xs text-muted-foreground truncate w-full text-center">
                          {image.file?.name || image.url || "Image"}
                        </div>
                      </div>
                    </Draggable>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Audios Section */}
        {audios.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Music className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Audios</span>
            </div>
            <ScrollArea className="max-h-32">
              <div className="grid grid-cols-3 gap-2 max-w-full">
                {audios.map((audio, idx) => {
                  const srcAudio = audio.metadata?.uploadedUrl || audio.url || "";
                  const dragData = buildAudioDragPayload(srcAudio, audio.file?.name || "Audio");
                  return (
                    <Draggable
                      key={audio.id || idx}
                      data={dragData}
                      shouldDisplayPreview={!isDraggingOverTimeline}
                      renderCustomPreview={<div style={{ width: 72, height: 72, backgroundColor: '#3f3f46', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music className="text-white w-8 h-8" /></div>}
                    >
                      <div
                        className="flex items-center gap-2 flex-col w-full relative group"
                      >
                        <Card
                          className="w-16 h-16 flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing bg-slate-100"
                          onClick={() => handleAddAudio(audio)}
                        >
                          <Music className="w-8 h-8 text-muted-foreground" />
                        </Card>
                        <button
                          type="button"
                          className="absolute right-0 top-0 z-10 hidden group-hover:flex rounded-full bg-black/60 p-1 text-white hover:bg-red-500 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (audio.id) deleteUpload(audio.id);
                          }}
                          title="Delete upload"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <div className="text-xs text-muted-foreground truncate w-full text-center">
                          {audio.file?.name || audio.url || "Audio"}
                        </div>
                      </div>
                    </Draggable>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
};

function MediaGrid({
  media,
  favorites,
  onFavorite,
  onRemember,
  isDraggingOverTimeline,
  onVideo,
  onImage,
  onDelete,
}: {
  media: NonNullable<ReturnType<typeof useProjectEditor>>["media"];
  favorites: string[];
  onFavorite: (id: string) => void;
  onRemember: (id: string) => void;
  isDraggingOverTimeline: boolean;
  onVideo: (video: AddableAsset) => void;
  onImage: (image: AddableAsset) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ScrollArea className="max-h-32">
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
                    onRemember(m.id);
                    return isVideo
                      ? onVideo({ id: m.id, url: m.r2Url, metadata: { uploadedUrl: m.r2Url } })
                      : onImage({ id: m.id, url: m.r2Url, metadata: { uploadedUrl: m.r2Url } });
                  }}
                >
                  <button
                    type="button"
                    className="absolute left-1 top-1 z-10 rounded-full bg-black/40 p-1 text-white hover:bg-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(m.id);
                    }}
                    title="Delete media"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <button type="button" className="absolute right-1 top-1 z-10 rounded-full bg-black/40 p-1 text-white" onClick={(e) => { e.stopPropagation(); onFavorite(m.id); }} title={favorites.includes(m.id) ? "Remove favorite" : "Favorite asset"}>
                    <Star className={`h-3 w-3 ${favorites.includes(m.id) ? "fill-current" : ""}`} />
                  </button>
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
