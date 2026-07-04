import { useCallback, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Plus, Search, Trash2, Upload, GripVertical } from "lucide-react";
import { useEditorStore } from "../store";
import type { Clip, FactClip, MediaClip, TextClip, SubtitleClip } from "../schema";
import type { MediaAsset } from "../contract";

export function LeftPanel() {
  const panel = useEditorStore((s) => s.leftPanel);
  switch (panel) {
    case "media":
      return <MediaPanel />;
    case "library":
      return <LibraryPanel />;
    case "text":
      return <TextPanel />;
    case "subtitles":
      return <SubtitlesPanel />;
    case "audio":
      return <AudioPanel />;
    case "effects":
      return <EffectsPanel />;
    case "scenes":
      return <ScenesPanel />;
    case "settings":
      return <SettingsPanel />;
  }
}

function PanelShell({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <aside className="flex w-72 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </aside>
  );
}

/* ============================================================================
   MEDIA PANEL — project media with + button, drag-and-drop, delete
   ============================================================================ */
function MediaPanel() {
  const bundle = useEditorStore((s) => s.bundle);
  const addClip = useEditorStore((s) => s.addClip);
  const currentTime = useEditorStore((s) => s.currentTime);
  const [q, setQ] = useState("");

  const assets = useMemo(() => {
    const all = bundle?.mediaAssets ?? [];
    if (!q) return all;
    return all.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  }, [bundle, q]);

  const onAddToTimeline = (a: MediaAsset) => {
    const id = `clip_${nanoid(8)}`;
    const clip: MediaClip = {
      id,
      trackId: a.kind === "video" ? "tr-video" : "tr-image",
      kind: "media",
      mediaKind: a.kind,
      assetId: a.id,
      start: currentTime,
      duration: a.duration ?? 3,
      inPoint: 0,
      locked: false,
      hidden: false,
      opacity: 1,
      rotation: 0,
      speed: 1,
      volume: a.kind === "video" ? 0 : 0,
      filter: { brightness: 0, contrast: 0, saturation: 0, preset: "none" },
      keyframes: { x: [], y: [], scale: [], rotation: [], opacity: [] },
    };
    addClip(clip);
  };

  return (
    <PanelShell title="Project Media">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search assets…"
          className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-indigo-300 focus:bg-white"
        />
      </div>

      {assets.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
          <Upload className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-xs text-slate-500">
            No media uploaded yet. Upload assets in the Media tab of the Content Studio.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map((a) => (
            <MediaAssetCard
              key={a.id}
              asset={a}
              onAdd={() => onAddToTimeline(a)}
            />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

function MediaAssetCard({
  asset,
  onAdd,
}: {
  asset: MediaAsset;
  onAdd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/asset-id", asset.id)}
      className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-slate-100">
        {asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl} alt={asset.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
            {asset.kind === "video" ? "VID" : "IMG"}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-800">{asset.name}</p>
        <p className="text-[10px] text-slate-400">
          {asset.kind === "video" ? "Video" : "Image"}
          {asset.duration ? ` · ${asset.duration.toFixed(1)}s` : ""}
        </p>
      </div>
      <button
        onClick={onAdd}
        title="Add to timeline"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-indigo-100"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ============================================================================
   LIBRARY PANEL — all uploaded user media from library
   ============================================================================ */
function LibraryPanel() {
  const bundle = useEditorStore((s) => s.bundle);
  const addClip = useEditorStore((s) => s.addClip);
  const currentTime = useEditorStore((s) => s.currentTime);
  const [q, setQ] = useState("");

  const assets = useMemo(() => {
    const all = bundle?.mediaAssets ?? [];
    if (!q) return all;
    return all.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  }, [bundle, q]);

  const images = assets.filter((a) => a.kind === "image");
  const videos = assets.filter((a) => a.kind === "video");

  const onAdd = (a: MediaAsset) => {
    const id = `clip_${nanoid(8)}`;
    addClip({
      id,
      trackId: a.kind === "video" ? "tr-video" : "tr-image",
      kind: "media",
      mediaKind: a.kind,
      assetId: a.id,
      start: currentTime,
      duration: a.duration ?? 3,
      inPoint: 0,
      locked: false,
      hidden: false,
      opacity: 1,
      rotation: 0,
      speed: 1,
      volume: 0,
      filter: { brightness: 0, contrast: 0, saturation: 0, preset: "none" },
      keyframes: { x: [], y: [], scale: [], rotation: [], opacity: [] },
    });
  };

  return (
    <PanelShell title="My Library">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search library…"
          className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-indigo-300 focus:bg-white"
        />
      </div>

      {assets.length === 0 ? (
        <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          No media in library. Upload assets in the Media upload step.
        </p>
      ) : (
        <div className="space-y-4">
          {videos.length > 0 && (
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Videos ({videos.length})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {videos.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onAdd(a)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/asset-id", a.id)}
                    className="group overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-left hover:border-indigo-300"
                  >
                    <div className="aspect-video bg-slate-200 relative">
                      {a.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.thumbnailUrl} alt={a.name} className="h-full w-full object-cover" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition">
                        <Plus className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition" />
                      </div>
                    </div>
                    <div className="truncate p-1.5 text-[11px] text-slate-700">{a.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {images.length > 0 && (
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Images ({images.length})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {images.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onAdd(a)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/asset-id", a.id)}
                    className="group overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-left hover:border-indigo-300"
                  >
                    <div className="aspect-video bg-slate-200 relative">
                      {a.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.thumbnailUrl} alt={a.name} className="h-full w-full object-cover" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition">
                        <Plus className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition" />
                      </div>
                    </div>
                    <div className="truncate p-1.5 text-[11px] text-slate-700">{a.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}

/* ============================================================================
   TEXT PANEL — title, subtitle presets, add custom text
   ============================================================================ */

const TEXT_PRESETS = [
  { label: "Heading", size: 96, weight: 800, color: "#ffffff", animation: "pop" as const },
  { label: "Subheading", size: 64, weight: 700, color: "#ffffff", animation: "slide-up" as const },
  { label: "Body Text", size: 48, weight: 500, color: "#ffffff", animation: "fade" as const },
  { label: "Caption", size: 32, weight: 400, color: "#f0f0f0", animation: "fade" as const },
  { label: "Bold Callout", size: 72, weight: 900, color: "#FFD700", animation: "pop" as const },
  { label: "Minimal", size: 40, weight: 300, color: "#ffffff", animation: "fade" as const },
];

const SUBTITLE_PRESETS: { label: string; preset: SubtitleClip["preset"] }[] = [
  { label: "Modern", preset: "modern" },
  { label: "Instagram", preset: "instagram" },
  { label: "Reels", preset: "reels" },
  { label: "Luxury", preset: "luxury" },
  { label: "Minimal", preset: "minimal" },
];

function TextPanel() {
  const currentTime = useEditorStore((s) => s.currentTime);
  const addClip = useEditorStore((s) => s.addClip);
  const timeline = useEditorStore((s) => s.timeline);
  const updateClip = useEditorStore((s) => s.updateClip);

  const subtitleClips = useMemo(
    () => (timeline?.clips ?? []).filter((c): c is SubtitleClip => c.kind === "subtitle"),
    [timeline],
  );

  const onAddText = (label: string, size: number, weight: number, color: string, anim: TextClip["animation"]) => {
    const text: TextClip = {
      id: `clip_${nanoid(8)}`,
      trackId: "tr-text",
      kind: "text",
      text: label,
      start: currentTime,
      duration: 3,
      inPoint: 0,
      locked: false,
      hidden: false,
      animation: anim,
      style: {
        fontFamily: "Inter",
        fontSize: size,
        fontWeight: weight,
        color: color,
        align: "center",
        strokeWidth: 0,
        shadow: true,
        x: 0.5,
        y: 0.5,
      },
      keyframes: { x: [], y: [], scale: [], rotation: [], opacity: [] },
    };
    addClip(text);
  };

  const onAddCustomText = () => {
    onAddText("Your Text Here", 56, 600, "#ffffff", "fade");
  };

  const onChangeSubPreset = (preset: SubtitleClip["preset"]) => {
    subtitleClips.forEach((c) => {
      updateClip(c.id, { preset } as Partial<Clip>);
    });
  };

  return (
    <PanelShell
      title="Text"
      actions={
        <button
          onClick={onAddCustomText}
          className="flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
        >
          <Plus className="h-3.5 w-3.5" /> Add Text
        </button>
      }
    >
      <div className="space-y-4">
        {/* Text Presets */}
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Title Presets
          </h4>
          <div className="space-y-2">
            {TEXT_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => onAddText(p.label, p.size, p.weight, p.color, p.animation)}
                className="block w-full rounded-lg border border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900 px-3 py-3 text-left hover:border-indigo-400 transition-colors"
              >
                <div
                  style={{
                    fontSize: Math.min(p.size / 4, 24),
                    fontWeight: p.weight,
                    color: p.color,
                  }}
                >
                  {p.label}
                </div>
                <div className="mt-1 text-[10px] text-slate-400">
                  {p.size}px · {p.weight}w · {p.animation}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Subtitle Style Presets */}
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Subtitle Style
          </h4>
          <p className="mb-2 text-[10px] text-slate-400">
            Apply a preset style to all subtitles in the timeline.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SUBTITLE_PRESETS.map((sp) => (
              <button
                key={sp.preset}
                onClick={() => onChangeSubPreset(sp.preset)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                {sp.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
   SUBTITLES PANEL — list and edit
   ============================================================================ */
function SubtitlesPanel() {
  const timeline = useEditorStore((s) => s.timeline);
  const updateClip = useEditorStore((s) => s.updateClip);
  const seek = useEditorStore((s) => s.seek);
  const deleteClips = useEditorStore((s) => s.deleteClips);

  const subs = useMemo(
    () =>
      (timeline?.clips ?? [])
        .filter((c): c is SubtitleClip => c.kind === "subtitle")
        .sort((a, b) => a.start - b.start),
    [timeline],
  );

  return (
    <PanelShell title="Subtitles">
      {subs.length === 0 ? (
        <p className="text-xs text-slate-500">No subtitle track loaded.</p>
      ) : (
        <div className="space-y-1">
          {subs.map((s) => (
            <div key={s.id} className="group rounded-md border border-slate-200 p-2 hover:border-slate-300">
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => seek(s.start)}
                  className="text-[10px] font-medium text-indigo-600 hover:underline"
                >
                  {s.start.toFixed(2)}s – {(s.start + s.duration).toFixed(2)}s
                </button>
                <button
                  onClick={() => deleteClips([s.id])}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <textarea
                value={s.text}
                onChange={(e) => updateClip(s.id, { text: e.target.value })}
                rows={2}
                className="w-full resize-none rounded border border-slate-200 p-1 text-xs outline-none focus:border-indigo-300"
              />
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

/* ============================================================================
   AUDIO PANEL
   ============================================================================ */
function AudioPanel() {
  const bundle = useEditorStore((s) => s.bundle);
  const timeline = useEditorStore((s) => s.timeline);
  const updateClip = useEditorStore((s) => s.updateClip);

  const audioClips = useMemo(
    () => (timeline?.clips ?? []).filter((c) => c.kind === "audio"),
    [timeline],
  );

  return (
    <PanelShell title="Audio">
      {bundle ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3">
            <div className="text-xs font-semibold text-slate-900">🎙 Voiceover (Gemini TTS)</div>
            <div className="mt-1 text-[11px] text-slate-600">
              Duration: {bundle.audioAsset.duration.toFixed(2)}s
            </div>
            {bundle.audioAsset.url && (
              <audio controls className="mt-2 w-full h-8" src={bundle.audioAsset.url} />
            )}
          </div>

          {audioClips.length > 0 && (
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Audio Clips on Timeline
              </h4>
              {audioClips.map((c) => (
                <div key={c.id} className="mb-2 rounded-md border border-slate-200 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700 capitalize">{(c as any).role ?? "audio"}</span>
                    <span className="text-slate-400">{c.start.toFixed(1)}s</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-slate-500 w-12">Volume</span>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.01}
                      value={(c as any).volume ?? 1}
                      onChange={(e) => updateClip(c.id, { volume: Number(e.target.value) } as any)}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </PanelShell>
  );
}

/* ============================================================================
   EFFECTS PANEL — transitions and filters you can apply
   ============================================================================ */
const TRANSITIONS = [
  { kind: "fade", label: "Fade", color: "from-indigo-100 to-indigo-200" },
  { kind: "crossfade", label: "Crossfade", color: "from-purple-100 to-purple-200" },
  { kind: "slide", label: "Slide", color: "from-blue-100 to-blue-200" },
  { kind: "wipe", label: "Wipe", color: "from-green-100 to-green-200" },
  { kind: "zoom", label: "Zoom", color: "from-amber-100 to-amber-200" },
] as const;

const FILTERS = [
  { preset: "none", label: "None" },
  { preset: "vintage", label: "Vintage" },
  { preset: "bw", label: "B&W" },
  { preset: "warm", label: "Warm" },
  { preset: "cool", label: "Cool" },
] as const;

function EffectsPanel() {
  const selectedId = useEditorStore((s) => s.selectedClipIds[0]);
  const timeline = useEditorStore((s) => s.timeline);
  const updateClip = useEditorStore((s) => s.updateClip);

  const clip = timeline?.clips.find((c) => c.id === selectedId) ?? null;

  const applyTransition = (kind: string) => {
    if (!clip) return;
    updateClip(clip.id, {
      transitionIn: { kind: kind as any, duration: 0.4 },
      transitionOut: { kind: kind as any, duration: 0.4 },
    } as Partial<Clip>);
  };

  const applyFilter = (preset: string) => {
    if (!clip || clip.kind !== "media") return;
    updateClip(clip.id, {
      filter: { ...(clip as MediaClip).filter, preset: preset as any },
    } as any);
  };

  return (
    <PanelShell title="Effects & Transitions">
      {!clip ? (
        <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-700">
          Select a clip on the timeline to apply transitions or filters.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Transitions
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {TRANSITIONS.map((t) => {
                const isActive =
                  (clip.transitionIn?.kind === t.kind) ||
                  (clip.transitionOut?.kind === t.kind);
                return (
                  <button
                    key={t.kind}
                    onClick={() => applyTransition(t.kind)}
                    className={`rounded-lg border p-3 text-xs font-medium transition-colors bg-gradient-to-br ${t.color} ${
                      isActive
                        ? "border-indigo-400 ring-2 ring-indigo-200"
                        : "border-slate-200 hover:border-indigo-300"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  if (!clip) return;
                  updateClip(clip.id, {
                    transitionIn: undefined,
                    transitionOut: undefined,
                  } as Partial<Clip>);
                }}
                className="rounded-lg border border-slate-200 p-3 text-xs font-medium text-slate-500 hover:border-red-300 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          </div>

          {clip.kind === "media" && (
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Filters
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {FILTERS.map((f) => {
                  const isActive = (clip as MediaClip).filter.preset === f.preset;
                  return (
                    <button
                      key={f.preset}
                      onClick={() => applyFilter(f.preset)}
                      className={`rounded-md border px-2 py-2 text-[11px] font-medium transition-colors ${
                        isActive
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:border-indigo-300"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}

/* ============================================================================
   SCENES PANEL
   ============================================================================ */
function ScenesPanel() {
  const timeline = useEditorStore((s) => s.timeline);
  const addScene = useEditorStore((s) => s.addScene);
  const deleteScene = useEditorStore((s) => s.deleteScene);
  const duplicateScene = useEditorStore((s) => s.duplicateScene);
  const selectScene = useEditorStore((s) => s.setSelectedScene);
  const selected = useEditorStore((s) => s.selectedSceneId);
  return (
    <PanelShell title="Scenes">
      <button
        onClick={addScene}
        className="mb-2 w-full rounded-md bg-indigo-50 px-2 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
      >
        + Add Scene
      </button>
      <div className="space-y-1">
        {(timeline?.scenes ?? []).map((s, i) => (
          <div
            key={s.id}
            onClick={() => selectScene(s.id)}
            className={`cursor-pointer rounded-md border p-2 text-xs ${
              selected === s.id
                ? "border-indigo-400 bg-indigo-50"
                : "border-slate-200 hover:border-indigo-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{i + 1}. {s.title}</span>
              <div className="flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateScene(s.id);
                  }}
                  className="text-[10px] text-slate-500 hover:text-indigo-600"
                >
                  Dup
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteScene(s.id);
                  }}
                  className="text-[10px] text-slate-500 hover:text-red-600"
                >
                  Del
                </button>
              </div>
            </div>
            <div className="mt-0.5 text-slate-500">
              {s.start.toFixed(1)}s · {s.duration.toFixed(1)}s
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

/* ============================================================================
   SETTINGS PANEL — FPS, orientation, resolution
   ============================================================================ */
const ORIENTATION_PRESETS = [
  { label: "Landscape (16:9)", w: 1920, h: 1080, icon: "🖥" },
  { label: "Portrait / Reel (9:16)", w: 1080, h: 1920, icon: "📱" },
  { label: "Square (1:1)", w: 1080, h: 1080, icon: "⬜" },
  { label: "Vertical (4:5)", w: 1080, h: 1350, icon: "📷" },
  { label: "Cinematic (21:9)", w: 2560, h: 1080, icon: "🎬" },
];

const FPS_OPTIONS = [24, 25, 30, 50, 60];

function SettingsPanel() {
  const timeline = useEditorStore((s) => s.timeline);
  const updateSettings = useEditorStore((s) => s.updateTimelineSettings);

  if (!timeline) return <PanelShell title="Settings"><p className="text-xs text-slate-500">Loading…</p></PanelShell>;

  const currentW = timeline.width;
  const currentH = timeline.height;
  const currentFps = timeline.fps;

  return (
    <PanelShell title="Project Settings">
      <div className="space-y-5">
        {/* Orientation */}
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Orientation / Resolution
          </h4>
          <div className="space-y-1.5">
            {ORIENTATION_PRESETS.map((p) => {
              const isActive = currentW === p.w && currentH === p.h;
              return (
                <button
                  key={p.label}
                  onClick={() => updateSettings({ width: p.w, height: p.h })}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    isActive
                      ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                      : "border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-base">{p.icon}</span>
                  <span className="flex-1">{p.label}</span>
                  <span className="text-[10px] text-slate-400">{p.w}×{p.h}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom resolution */}
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Custom Resolution
          </h4>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500">Width</label>
              <input
                type="number"
                value={currentW}
                onChange={(e) => updateSettings({ width: Math.max(100, Number(e.target.value)) })}
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-slate-500">Height</label>
              <input
                type="number"
                value={currentH}
                onChange={(e) => updateSettings({ height: Math.max(100, Number(e.target.value)) })}
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
              />
            </div>
          </div>
        </div>

        {/* FPS */}
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Frame Rate (FPS)
          </h4>
          <div className="flex flex-wrap gap-2">
            {FPS_OPTIONS.map((fps) => {
              const isActive = currentFps === fps;
              return (
                <button
                  key={fps}
                  onClick={() => updateSettings({ fps })}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-indigo-300"
                  }`}
                >
                  {fps} fps
                </button>
              );
            })}
          </div>
        </div>

        {/* Info summary */}
        <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 space-y-1">
          <div className="flex justify-between"><span>Resolution</span><span className="font-mono">{currentW}×{currentH}</span></div>
          <div className="flex justify-between"><span>Aspect Ratio</span><span className="font-mono">{(currentW / currentH).toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Frame Rate</span><span className="font-mono">{currentFps} fps</span></div>
          <div className="flex justify-between"><span>Duration</span><span className="font-mono">{timeline.duration.toFixed(2)}s</span></div>
        </div>
      </div>
    </PanelShell>
  );
}
