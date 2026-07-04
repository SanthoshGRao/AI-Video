"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Upload, Plus, Trash2, Video, Image as ImageIcon, Music2,
  Square, Circle, Triangle, Type, GripVertical, FolderPlus,
} from "lucide-react";
import { useEditor, type StageElementKind, type MediaItem, type MediaKind } from "@/lib/editor-v2/editor-store";
import {
  TOOLS, TEMPLATES, TEXT_PRESETS, EMOJIS, EFFECTS, TRANSITIONS,
} from "@/lib/editor-v2/editor-data";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { mediaEngine } from "@/lib/editor-v2/editor/media-engine";
import { assetManager, type AssetRecord } from "@/lib/editor-v2/editor/asset-manager";
import { useParams } from "next/navigation";
import { TransitionPreview } from "@/components/editor-v2/transition-preview";

function useActiveProjectId(): string {
  const activeProjectId = useEditor((s) => s.activeProjectId);
  const params = useParams() as { id?: string; project_id?: string };
  return activeProjectId ?? params.id ?? params.project_id ?? "";
}

/* read an uploaded File into a MediaItem (object URL + duration) and
 * register it with the Phase 3 Media Engine so the Asset Manager,
 * thumbnail worker, and IndexedDB cache stay in the loop. */
async function readAudioWaveform(src: string, bars = 80): Promise<number[] | undefined> {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return undefined;
    const buffer = await fetch(src).then((r) => r.arrayBuffer());
    const ctx = new AudioContextCtor();
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / bars));
    const waveform = Array.from({ length: bars }, (_, i) => {
      let sum = 0;
      const start = i * block;
      const end = Math.min(data.length, start + block);
      for (let j = start; j < end; j++) sum += Math.abs(data[j]);
      return Math.min(1, sum / Math.max(1, end - start) * 3);
    });
    void ctx.close();
    return waveform;
  } catch {
    return undefined;
  }
}

async function fileToMedia(file: File): Promise<Omit<MediaItem, "id">> {
  const src = URL.createObjectURL(file);
  let kind: MediaKind = "image";
  if (file.type.startsWith("video")) kind = "video";
  else if (file.type.startsWith("audio")) kind = "audio";

  let duration = 0;
  if (kind !== "image") {
    duration = await new Promise<number>((resolve) => {
      const el = document.createElement(kind === "video" ? "video" : "audio");
      el.preload = "metadata";
      el.onloadedmetadata = () => resolve(Math.round(el.duration) || 5);
      el.onerror = () => resolve(5);
      el.src = src;
    });
  }
  // Register with Media Engine (non-blocking — workers + cache run in bg).
  void mediaEngine.register({ name: file.name, kind, originalUrl: src, size: file.size });
  const waveform = kind === "audio" ? await readAudioWaveform(src) : undefined;
  return { name: file.name, kind, src, duration, size: file.size, thumb: kind === "image" ? src : undefined, waveform };
}

type UploadedMediaAsset = {
  id: string;
  r2Url?: string;
  url?: string;
  thumbnailUrl?: string | null;
  originalName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  type?: string;
};

async function uploadProjectMedia(projectId: string, file: File, local: Omit<MediaItem, "id">) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/projects/${projectId}/media`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const json = await res.json() as { mediaAsset?: UploadedMediaAsset };
  const asset = json.mediaAsset;
  if (!asset?.id) throw new Error("Upload response missing media asset");
  const src = asset.r2Url ?? asset.url;
  if (!src) throw new Error("Upload response missing media URL");
  return {
    mediaAssetId: asset.id,
    name: asset.originalName ?? local.name,
    kind: local.kind,
    src,
    duration: local.duration,
    size: asset.fileSizeBytes ?? local.size,
    thumb: asset.thumbnailUrl ?? (local.kind === "image" ? src : local.thumb),
    waveform: local.waveform,
  } satisfies Partial<MediaItem> & { src: string };
}

/** Subscribe to the asset record matching a media src. */
function useAssetForSrc(src?: string): AssetRecord | null {
  const [rec, setRec] = useState<AssetRecord | null>(() =>
    src ? assetManager.all().find((a) => a.originalUrl === src) ?? null : null,
  );
  useEffect(() => {
    if (!src) return;
    const unsub = assetManager.subscribe((all) => {
      setRec(all.find((a) => a.originalUrl === src) ?? null);
    });
    return () => { unsub(); };
  }, [src]);
  return rec;
}

export function AssetPanel() {
  const { activeTool, projectMedia, addToProjectMedia, replaceMediaSource, library, loadUserLibrary } = useEditor();
  const tool = TOOLS.find((t) => t.id === activeTool);
  const [searchQuery, setSearchQuery] = useState("");
  const projectId = useActiveProjectId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset search when switching tabs
  useEffect(() => setSearchQuery(""), [activeTool]);

  const handleUploadFiles = async (files: FileList) => {
    if (activeTool === "media") {
      const toastId = toast.loading("Processing media...");
      try {
        for (const file of Array.from(files)) {
          const media = await fileToMedia(file);
          const added = addToProjectMedia(media);
          if (!added) { toast.error(`${file.name} is already added`); continue; }
          try {
            const uploaded = await uploadProjectMedia(projectId, file, media);
            replaceMediaSource(media.src, uploaded);
            toast.success(`${file.name} uploaded`);
          } catch (err) {
            console.error(err);
            toast.error(`Failed to upload ${file.name}`);
          }
        }
      } finally {
        toast.dismiss(toastId);
      }
    } else if (activeTool === "library") {
      const toastId = toast.loading("Processing media...");
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          try {
            const res = await fetch(`/api/media/upload/global`, {
              method: "POST",
              body: formData,
            });
            if (!res.ok) throw new Error("Upload failed");
            await loadUserLibrary();
            toast.success(`${file.name} added to library`);
          } catch (err) {
            console.error(err);
            toast.error(`Failed to add ${file.name} to library`);
          }
        }
      } finally {
        toast.dismiss(toastId);
      }
    }
  };

  return (
    <aside className="w-full h-full bg-panel border-r border-border flex flex-col overflow-hidden">
      <header className="px-4 pt-4 pb-3 border-b border-border">
        <h2 className="text-sm font-semibold tracking-tight mb-3" style={{ color: "#f4f4f5" }}>{tool?.label}</h2>
        {activeTool !== "text" && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder={`Search ${tool?.label.toLowerCase()}…`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 bg-white/5 border-border focus-visible:ring-1 focus-visible:ring-brand text-xs"
              />
            </div>
            {(activeTool === "media" || activeTool === "library") && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="size-8 shrink-0 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition flex items-center justify-center cursor-pointer border border-white/10"
                title={`Upload to ${tool?.label}`}
              >
                <Upload className="size-4" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*"
                  multiple
                  hidden
                  onChange={(e) => { if (e.target.files?.length) handleUploadFiles(e.target.files); e.currentTarget.value = ""; }}
                />
              </button>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTool}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="p-3"
          >
            {activeTool === "media" && <ProjectMedia searchQuery={searchQuery} />}
            {activeTool === "library" && <LibraryMedia searchQuery={searchQuery} />}

            {activeTool === "text" && <TextStyles searchQuery={searchQuery} />}
            {activeTool === "shapes" && <ShapeGrid searchQuery={searchQuery} />}
            {activeTool === "stickers" && <StickerGrid searchQuery={searchQuery} />}
            {activeTool === "audio" && <AudioPanel searchQuery={searchQuery} />}
            {activeTool === "transitions" && <TransitionList searchQuery={searchQuery} />}
            {activeTool === "effects" && <EffectList searchQuery={searchQuery} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}

/* ---------------- Media item card (shared) ---------------- */
function MediaCard({
  m, onAdd, onDelete, onImport,
}: {
  m: MediaItem;
  onAdd: () => void;
  onDelete: () => void;
  onImport?: () => void;
}) {
  const asset = useAssetForSrc(m.src);
  const statusColor =
    asset?.status === "error" ? "bg-red-500/80"
    : asset?.status === "ready" || asset?.status === "cached" ? "bg-emerald-500/80"
    : asset?.status === "processing" || asset?.status === "loading" ? "bg-amber-500/80"
    : "bg-zinc-500/60";
  return (
    <div
      className="group relative rounded-md ring-1 ring-white/10 overflow-hidden bg-zinc-900 cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-media", JSON.stringify(m));
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="relative aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900">
        {asset?.thumbnailUrl ? (
          <img src={asset.thumbnailUrl || undefined} alt={m.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : m.thumb && !m.thumb.startsWith("blob:") ? (
          <img src={m.thumb} alt={m.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            {m.kind === "image" && m.src && !m.src.startsWith("blob:") && (
              <img src={m.src} alt={m.name} className="absolute inset-0 w-full h-full object-cover" />
            )}
            {m.kind === "video" && m.src && !m.src.startsWith("blob:") && (
              <video src={m.src} className="absolute inset-0 w-full h-full object-cover" muted />
            )}
            {m.kind === "audio" && (
              <div className="absolute inset-0 grid place-items-center text-emerald-400"><Music2 className="size-6" /></div>
            )}
            {(m.src?.startsWith("blob:") || (!m.src && m.kind !== "audio")) && (
              <div className="absolute inset-0 grid place-items-center text-zinc-500">
                <ImageIcon className="size-5 opacity-50" />
              </div>
            )}
          </>
        )}
        <span className="absolute bottom-1 right-1 px-1 py-px text-[9px] font-mono bg-black/70 text-white rounded">
          {m.kind === "image" ? "IMG" : `${m.duration}s`}
        </span>
        <span
          title={asset ? `${asset.status}${asset.metadata?.width ? ` · ${asset.metadata.width}×${asset.metadata.height}` : ""}` : "unregistered"}
          className={`absolute top-1 left-1 inline-flex items-center gap-1 px-1.5 py-px text-[9px] font-mono text-white rounded ${statusColor}`}
        >
          {asset?.status ?? "—"}
          {asset?.progress !== undefined && asset.status === "processing" && (
            <span>{Math.round(asset.progress * 100)}%</span>
          )}
        </span>
        {/* hover actions */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5">
          <button onClick={onAdd} title="Add to timeline" className="size-7 grid place-items-center rounded-full bg-brand text-white hover:brightness-110">
            <Plus className="size-4" />
          </button>
          {onImport && (
            <button onClick={onImport} title="Add to project" className="size-7 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
              <FolderPlus className="size-3.5" />
            </button>
          )}
          <button onClick={onDelete} title="Delete" className="size-7 grid place-items-center rounded-full bg-red-500/80 text-white hover:bg-red-500">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <p className="text-[10px] text-zinc-400 px-1.5 py-1 truncate">{m.name}</p>
    </div>
  );
}

/* ---------------- Project media (req 6,8,9,10) ---------------- */
function ProjectMedia({ searchQuery }: { searchQuery: string }) {
  const { projectMedia, removeProjectMedia, addMediaToTimeline } = useEditor();
  const filtered = projectMedia.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-3">
      {filtered.length === 0 ? (
        <p className="text-[11px] text-zinc-500 text-center py-6">No media yet. Click the upload icon in the header to add files.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((m) => (
            <MediaCard
              key={m.id}
              m={m}
              onAdd={() => { addMediaToTimeline(m); toast.success("Added to timeline"); }}
              onDelete={() => removeProjectMedia(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Library media (req 7) ---------------- */
function LibraryMedia({ searchQuery }: { searchQuery: string }) {
  const { library, loadUserLibrary, removeLibraryItem, importLibraryItemToProject, addMediaToTimeline } = useEditor();

  useEffect(() => {
    void loadUserLibrary();
  }, [loadUserLibrary]);

  const filtered = library.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-3">
      {filtered.length === 0 ? (
        <p className="text-[11px] text-zinc-500 text-center py-6">Your reusable library is empty. Click the upload icon in the header to add files.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((m) => (
            <MediaCard
              key={m.id}
              m={m}
              onAdd={() => { addMediaToTimeline(m); toast.success("Added to timeline"); }}
              onImport={() => { importLibraryItemToProject(m.id); toast.success("Added to project"); }}
              onDelete={() => removeLibraryItem(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}


/* ---------------- Text (req 12) ---------------- */
function TextStyles({ searchQuery }: { searchQuery: string }) {
  const { addElement } = useEditor();
  const { id: project_id } = useParams() as { id: string };

  const add = (text: string, fontSize: number, fontWeight: number, fontFamily: string, color: string) => {
    addElement({
      kind: "text", x: 18, y: 40, w: 64, h: 16, rotation: 0,
      text, color, fontSize, fontWeight, fontFamily, align: "center", opacity: 100,
    });
    toast.success("Text added");
  };
  const filtered = TEXT_PRESETS.filter((p) => p.label.toLowerCase().includes(searchQuery.toLowerCase()));
  return (
    <div className="space-y-3">
      <button
        onClick={() => add("Double-click to edit", 40, 700, "Inter", "#ffffff")}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:brightness-110 transition"
      >
        <Type className="size-3.5 inline mr-1.5" /> Add a text box
      </button>

      <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Presets</p>
      <div className="space-y-1.5">
        {filtered.map((p) => (
          <button
            key={p.label}
            onClick={() => add(p.text, p.fontSize, p.fontWeight, p.fontFamily, p.color)}
            className="w-full px-3 py-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-border text-left transition flex items-center justify-between"
          >
            <span style={{ fontSize: Math.min(p.fontSize / 2.6, 22), fontWeight: p.fontWeight, fontFamily: p.fontFamily, color: p.color }}>
              {p.label}
            </span>
            <span className="text-[9px] text-zinc-500 font-mono">{p.fontSize}px</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const WORD_SHAPES: { kind: string; shapeType?: string; label: string }[] = [
  { kind: "rect", label: "Rectangle" },
  { kind: "ellipse", label: "Oval" },
  { kind: "triangle", label: "Triangle" },
  { kind: "shape", shapeType: "line", label: "Line" },
  { kind: "shape", shapeType: "cloud", label: "Cloud" },
  { kind: "shape", shapeType: "star", label: "Star" },
  { kind: "shape", shapeType: "arrow", label: "Right Arrow" },
  { kind: "shape", shapeType: "pentagon", label: "Pentagon" },
  { kind: "shape", shapeType: "hexagon", label: "Hexagon" },
  { kind: "shape", shapeType: "heart", label: "Heart" },
  { kind: "shape", shapeType: "bubble", label: "Speech Bubble" }
];

/* ---------------- Shapes ---------------- */
function ShapeGrid({ searchQuery }: { searchQuery: string }) {
  const { addElement } = useEditor();

  const addShape = (s: typeof WORD_SHAPES[0]) => {
    if (s.kind === "shape") {
      addElement({
        kind: "shape",
        shapeType: s.shapeType,
        x: 35, y: 35, w: 30, h: 30, rotation: 0,
        color: "#ffffff", opacity: 100
      });
    } else {
      addElement({
        kind: s.kind as any,
        x: 35, y: 35, w: 30, h: 30, rotation: 0,
        color: "#ffffff", opacity: 100
      });
    }
    toast.success(`${s.label} shape added`);
  };

  const filtered = WORD_SHAPES.filter((s) => s.label.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="grid grid-cols-3 gap-2">
      {filtered.map((s) => (
        <button
          key={s.label}
          onClick={() => addShape(s)}
          className="p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-border transition flex flex-col items-center gap-2"
        >
          {s.kind === "rect" && <Square className="size-5 text-zinc-300" />}
          {s.kind === "ellipse" && <Circle className="size-5 text-zinc-300" />}
          {s.kind === "triangle" && <Triangle className="size-5 text-zinc-300" />}
          {s.kind === "shape" && s.shapeType === "line" && (
            <svg viewBox="0 0 100 100" className="size-5 text-zinc-300" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round">
              <line x1="10" y1="50" x2="90" y2="50" />
            </svg>
          )}
          {s.kind === "shape" && s.shapeType === "cloud" && (
            <svg viewBox="0 0 100 100" className="size-5 text-zinc-300" fill="currentColor">
              <path d="M 25,60 A 20,20 0 0,1 45,40 A 25,25 0 0,1 85,45 A 20,20 0 0,1 85,85 H 25 A 20,20 0 0,1 25,60 Z" />
            </svg>
          )}
          {s.kind === "shape" && s.shapeType === "star" && (
            <svg viewBox="0 0 100 100" className="size-5 text-zinc-300" fill="currentColor">
              <polygon points="50,5 64,36 98,36 70,57 81,91 50,70 19,91 30,57 2,36 36,36" />
            </svg>
          )}
          {s.kind === "shape" && s.shapeType === "arrow" && (
            <svg viewBox="0 0 100 100" className="size-5 text-zinc-300" fill="currentColor">
              <polygon points="10,35 60,35 60,15 90,50 60,85 60,65 10,65" />
            </svg>
          )}
          {s.kind === "shape" && s.shapeType === "pentagon" && (
            <svg viewBox="0 0 100 100" className="size-5 text-zinc-300" fill="currentColor">
              <polygon points="50,5 95,38 78,92 22,92 5,38" />
            </svg>
          )}
          {s.kind === "shape" && s.shapeType === "hexagon" && (
            <svg viewBox="0 0 100 100" className="size-5 text-zinc-300" fill="currentColor">
              <polygon points="50,5 90,28 90,72 50,95 10,72 10,28" />
            </svg>
          )}
          {s.kind === "shape" && s.shapeType === "heart" && (
            <svg viewBox="0 0 100 100" className="size-5 text-zinc-300" fill="currentColor">
              <path d="M50,30 C50,30 50,15 35,15 C18,15 18,37 18,37 C18,58 50,82 50,85 C50,82 82,58 82,37 C82,37 82,15 65,15 C50,15 50,30 50,30 Z" />
            </svg>
          )}
          {s.kind === "shape" && s.shapeType === "bubble" && (
            <svg viewBox="0 0 100 100" className="size-5 text-zinc-300" fill="currentColor">
              <path d="M10,15 h80 v50 H55 L35,85 V65 H10 Z" />
            </svg>
          )}
          <span className="text-[9px] text-zinc-400 font-medium text-center">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

const STICKERS_CATEGORIES: Record<string, string[]> = {
  "Smileys": [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "😊", "😇", "😉", "😍", "🥰", "😘", "😋", "😜", "🤪", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😔", "🥺", "😭", "😤", "😠", "😡", "🤯", "😳", "🥵", "🥶", "😱", "🤔", "🤫", "😐", "😬", "🙄", "😴", "😵", "🤐", "🤠", "😈", "🤡", "💩", "👻", "👽", "👾", "🤖"
  ],
  "Hands & Hearts": [
    "👋", "👌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "👍", "👎", "✊", "👊", "👏", "🙌", "👐", "🤝", "🙏", "✍️", "💪", "🧠", "👀", "👁️", "👅", "👄", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"
  ],
  "Animals": [
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐸", "🐵", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🐌", "🐞", "🐜", "🕷️", "🕸️", "🐢", "🐍", "🦎", "🐙", "🦑", "🦀", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🐘", "🐪", "🦒", "🦘", "🐕", "🐈", "🐓", "🦃", "🦚", "🦜", "🦢", "🦩", "🐇", "🐿️"
  ],
  "Objects": [
    "🏠", "🏡", "🏢", "🏬", "🏨", "🏦", "🏪", "🔑", "🗝️", "🔨", "🛠️", "🧱", "💰", "💵", "💳", "💎", "📈", "📉", "📊", "📋", "📌", "📍", "🗺️", "🚗", "🚙", "🚚", "🚜", "🛵", "🚲", "✈️", "🚀", "📱", "💻", "🖥️", "📷", "🎬", "🎵", "🏆", "🥇", "⚽", "🏀", "🎯", "🔮", "🔥", "✨", "⭐", "⚡", "💥", "🌈", "☀️", "❄️", "💧", "☔", "💨", "🌊", "🎈", "🎉", "🎊", "🎁", "🔔", "📣", "📢", "💬", "💭", "💯", "✅", "❌", "🚫"
  ]
};

/* ---------------- Stickers / emoji (req 13) ---------------- */
function StickerGrid({ searchQuery }: { searchQuery: string }) {
  const { addElement } = useEditor();
  const [activeCategory, setActiveCategory] = useState<string>("Smileys");

  const add = (emoji: string) => {
    addElement({
      kind: "sticker", x: 40, y: 40, w: 16, h: 16, rotation: 0,
      color: "#ffffff", emoji, opacity: 100,
    });
    toast.success("Sticker added");
  };

  const categories = Object.keys(STICKERS_CATEGORIES);
  const emojis = STICKERS_CATEGORIES[activeCategory] || [];
  const filtered = emojis.filter((e) => e.includes(searchQuery));

  return (
    <div className="space-y-3">
      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border/40 scroll-thin">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap rounded-md transition ${
              activeCategory === cat ? "bg-brand/15 text-brand-light" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-6 gap-1.5 max-h-[360px] overflow-y-auto pr-1">
        {filtered.map((e) => (
          <button
            key={e}
            onClick={() => add(e)}
            className="aspect-square grid place-items-center rounded-md text-xl bg-white/[0.03] hover:bg-white/[0.08] hover:scale-110 transition"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

const BGM_ITEMS: MediaItem[] = [
  { id: "bgm_1", name: "Inspiring Corporate BGM", kind: "audio", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", duration: 372, size: 0 },
  { id: "bgm_2", name: "Cinematic Ambient BGM", kind: "audio", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", duration: 425, size: 0 },
  { id: "bgm_3", name: "Upbeat Real Estate BGM", kind: "audio", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", duration: 302, size: 0 },
  { id: "bgm_4", name: "Relaxing Acoustic BGM", kind: "audio", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", duration: 320, size: 0 }
];

/* ---------------- Audio ---------------- */
function AudioPanel({ searchQuery }: { searchQuery: string }) {
  const { projectMedia, addMediaToTimeline } = useEditor();
  const allAudio = projectMedia.filter((m) => m.kind === "audio");
  
  const voiceovers = allAudio.filter(m => m.name.toLowerCase().includes("voiceover") || m.name.toLowerCase().includes("tts") || m.name.toLowerCase().includes("ai"));
  const importedAudio = allAudio.filter(m => !voiceovers.some(vo => vo.id === m.id));
  
  const filteredImported = importedAudio.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredVoiceovers = voiceovers.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredBgm = BGM_ITEMS.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
      {/* 1. Generated TTS Audio */}
      <div className="space-y-2">
        <h4 className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">AI Voiceovers (TTS)</h4>
        {filteredVoiceovers.length === 0 ? (
          <p className="text-[10px] text-zinc-500 px-1 py-1.5 italic">No generated voiceovers yet.</p>
        ) : (
          <div className="space-y-1.5">
            {filteredVoiceovers.map((m) => (
              <AudioCard key={m.id} m={m} onAdd={() => addMediaToTimeline(m)} />
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-border/40 my-2" />

      {/* 2. Imported Audio */}
      <div className="space-y-2">
        <h4 className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Imported Audio</h4>
        {filteredImported.length === 0 ? (
          <p className="text-[10px] text-zinc-500 px-1 py-1.5 italic">No imported audio. Upload files in the Media tab.</p>
        ) : (
          <div className="space-y-1.5">
            {filteredImported.map((m) => (
              <AudioCard key={m.id} m={m} onAdd={() => addMediaToTimeline(m)} />
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-border/40 my-2" />

      {/* 3. BGM (Background Music) */}
      <div className="space-y-2">
        <h4 className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Background Music (BGM)</h4>
        <div className="space-y-1.5">
          {filteredBgm.map((m) => (
            <AudioCard key={m.id} m={m} onAdd={() => addMediaToTimeline(m)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AudioCard({ m, onAdd }: { m: MediaItem; onAdd: () => void }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-border transition">
      <div className="size-9 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30 grid place-items-center">
        <Music2 className="size-4 text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200 truncate">{m.name}</p>
        <p className="text-[10px] text-zinc-500">{m.duration > 0 ? `${m.duration}s` : "Music"}</p>
      </div>
      <button onClick={() => { onAdd(); toast.success("Added to timeline"); }} className="size-7 grid place-items-center rounded-full bg-brand text-white hover:brightness-110">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/* ---------------- Transitions (req 16) ---------------- */
function TransitionList({ searchQuery }: { searchQuery: string }) {
  const filtered = TRANSITIONS.filter((t) => t.label.toLowerCase().includes(searchQuery.toLowerCase()));
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-400 px-1">Drag a transition onto the line between two clips on the timeline.</p>
      {filtered.map((t) => (
        <div
          key={t.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-transition", t.id);
            e.dataTransfer.effectAllowed = "copy";
          }}
          className={`group flex items-center gap-3 p-2.5 rounded-lg ring-1 ring-border hover:ring-brand/40 bg-white/[0.03] hover:bg-white/[0.06] cursor-grab active:cursor-grabbing transition`}
        >
          <TransitionPreview kind={t.id} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-zinc-200">{t.label}</p>
            <p className="text-[10px] text-zinc-500">{t.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Effects (req 17) ---------------- */
function EffectList({ searchQuery }: { searchQuery: string }) {
  const { selectedElementId, updateElement, elements } = useEditor();
  const sel = elements.find((e) => e.id === selectedElementId);
  const filtered = EFFECTS.filter((ef) => ef.label.toLowerCase().includes(searchQuery.toLowerCase()));
  return (
    <div className="space-y-3">
      {!sel ? (
        <p className="text-[11px] text-zinc-400 px-1">Select an image, video or shape on the canvas, then choose an effect.</p>
      ) : (
        <p className="text-[11px] text-zinc-400 px-1">Applying to <span className="text-zinc-200 font-medium">{sel.kind}</span></p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((ef) => (
          <button
            key={ef.id}
            disabled={!sel}
            onClick={() => { if (sel) { updateElement(sel.id, { effect: ef.id }); toast.success(`${ef.label} applied`); } }}
            className={`h-16 rounded-lg border text-xs font-semibold transition relative overflow-hidden disabled:opacity-40 ${
              sel?.effect === ef.id ? "border-brand bg-brand/10 text-brand-light" : "border-border bg-white/[0.03] hover:border-brand/30 text-zinc-300"
            }`}
          >
            <div className="absolute inset-0 opacity-40" style={{ background: "linear-gradient(135deg,#64748b,#0ea5e9)", filter: ef.css === "none" ? undefined : ef.css }} />
            <span className="relative z-10">{ef.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
