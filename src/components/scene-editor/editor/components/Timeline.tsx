/**
 * Multi-track virtualized timeline.
 *
 * Performance:
 *  - Only clips overlapping the visible time window are rendered (windowed).
 *  - Tracks are absolutely positioned; the parent does no per-clip layout work.
 *  - Drag/resize is local while the gesture is in flight, then commits a
 *    single store mutation on mouseup — so 500+ clips remain smooth.
 *
 * Interactions:
 *  - Click clip:        select
 *  - Shift+click:       multi-select
 *  - Drag clip body:    move (snap to 0.1s)
 *  - Drag clip edges:   resize
 *  - Click ruler:       seek
 *  - Drag playhead:     scrub
 *  - S:                 split at playhead
 *  - Delete/Backspace:  delete selected
 *  - ⌘D:                duplicate selected
 *  - +/-:               zoom
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EyeOff,
  Eye,
  Lock,
  LockOpen,
  Volume2,
  VolumeX,
  Trash2,
  Copy,
  Scissors,
} from "lucide-react";
import { editorHistory, useEditorStore } from "../store";
import type { Clip, Track } from "../schema";
import { clamp } from "../utils";

const HEADER_W = 168;
const RULER_H = 28;
const SCENE_H = 36;

export function Timeline() {
  const timeline = useEditorStore((s) => s.timeline);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const scrollX = useEditorStore((s) => s.scrollX);
  const setScrollX = useEditorStore((s) => s.setScrollX);
  const currentTime = useEditorStore((s) => s.currentTime);
  const seek = useEditorStore((s) => s.seek);
  const selected = useEditorStore((s) => s.selectedClipIds);
  const deleteClips = useEditorStore((s) => s.deleteClips);
  const duplicateClips = useEditorStore((s) => s.duplicateClips);
  const splitClipAt = useEditorStore((s) => s.splitClipAt);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(800);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        editorHistory.undo();
      } else if ((meta && e.shiftKey && e.key.toLowerCase() === "z") || (meta && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        editorHistory.redo();
      } else if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selected.length) duplicateClips(selected);
      } else if (e.key === " ") {
        e.preventDefault();
        useEditorStore.getState().togglePlay();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected.length) {
          e.preventDefault();
          deleteClips(selected);
          clearSelection();
        }
      } else if (e.key.toLowerCase() === "s") {
        if (selected.length) {
          selected.forEach((id) => splitClipAt(id, currentTime));
        }
      } else if (e.key === "+" || e.key === "=") {
        setZoom(zoom * 1.25);
      } else if (e.key === "-") {
        setZoom(zoom / 1.25);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, deleteClips, duplicateClips, splitClipAt, currentTime, zoom, setZoom, clearSelection]);

  if (!timeline) return null;

  const contentW = Math.max(timeline.duration * zoom + 200, viewportW);
  const tracks = timeline.tracks;
  const tracksH = tracks.reduce((s, t) => s + t.height, 0);

  // Windowing: only clips that overlap the visible time range
  const visibleStart = scrollX / zoom;
  const visibleEnd = (scrollX + viewportW) / zoom + 1;
  const visibleClips = useMemo(
    () =>
      timeline.clips.filter(
        (c) => c.start + c.duration >= visibleStart && c.start <= visibleEnd,
      ),
    [timeline.clips, visibleStart, visibleEnd],
  );

  // Track y offsets
  const trackOffsets = useMemo(() => {
    const map = new Map<string, number>();
    let y = 0;
    for (const t of tracks) {
      map.set(t.id, y);
      y += t.height;
    }
    return map;
  }, [tracks]);

  const onRulerClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    seek(x / zoom);
  };

  return (
    <div className="flex h-full flex-col border-t border-slate-200 bg-slate-50">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5 text-xs">
        <button
          onClick={() => useEditorStore.getState().addScene()}
          className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 hover:bg-slate-200"
        >
          + Scene
        </button>
        <div className="mx-1 h-4 w-px bg-slate-200" />
        {selected.length > 0 && (
          <>
            <button
              onClick={() => { selected.forEach((id) => splitClipAt(id, currentTime)); }}
              className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 hover:bg-slate-200"
              title="Split at playhead (S)"
            >
              <Scissors className="h-3 w-3" /> Split
            </button>
            <button
              onClick={() => duplicateClips(selected)}
              className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 hover:bg-slate-200"
              title="Duplicate (Ctrl+D)"
            >
              <Copy className="h-3 w-3" /> Dup
            </button>
            <button
              onClick={() => { deleteClips(selected); clearSelection(); }}
              className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 font-medium text-red-600 hover:bg-red-100"
              title="Delete (Delete)"
            >
              <Trash2 className="h-3 w-3" /> Del
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom(zoom / 1.25)} className="rounded px-2 py-0.5 hover:bg-slate-100">−</button>
          <span className="w-16 text-center font-mono text-[11px] text-slate-500">{Math.round(zoom)} px/s</span>
          <button onClick={() => setZoom(zoom * 1.25)} className="rounded px-2 py-0.5 hover:bg-slate-100">+</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Track headers */}
        <div className="flex w-[168px] flex-col border-r border-slate-200 bg-white" style={{ flex: "0 0 168px" }}>
          <div style={{ height: RULER_H + SCENE_H }} className="border-b border-slate-200" />
          {tracks.map((t) => (
            <TrackHeader key={t.id} track={t} />
          ))}
        </div>

        {/* Scrollable timeline body */}
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-x-auto overflow-y-hidden"
          onScroll={(e) => setScrollX((e.target as HTMLDivElement).scrollLeft)}
        >
          <div
            className="relative"
            style={{ width: contentW, height: RULER_H + SCENE_H + tracksH }}
          >
            {/* Ruler */}
            <Ruler width={contentW} zoom={zoom} onClick={onRulerClick} />

            {/* Scene lane */}
            <SceneLane top={RULER_H} width={contentW} zoom={zoom} />

            {/* Tracks background */}
            {tracks.map((t) => (
              <div
                key={t.id}
                className="absolute left-0 right-0 border-b border-slate-200"
                style={{
                  top: RULER_H + SCENE_H + (trackOffsets.get(t.id) ?? 0),
                  height: t.height,
                  background: t.hidden ? "repeating-linear-gradient(45deg,#f8fafc,#f8fafc 6px,#f1f5f9 6px,#f1f5f9 12px)" : "white",
                }}
              />
            ))}

            {/* Clips */}
            {visibleClips.map((c) => {
              const top = RULER_H + SCENE_H + (trackOffsets.get(c.trackId) ?? 0) + 4;
              const track = tracks.find((t) => t.id === c.trackId);
              return (
                <ClipBlock
                  key={c.id}
                  clip={c}
                  top={top}
                  height={(track?.height ?? 48) - 8}
                  zoom={zoom}
                  selected={selected.includes(c.id)}
                />
              );
            })}

            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500"
              style={{ left: currentTime * zoom }}
            >
              <div className="absolute -top-0.5 -left-1.5 h-3 w-3 rotate-45 bg-red-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ruler({ width, zoom, onClick }: { width: number; zoom: number; onClick: (e: React.MouseEvent) => void }) {
  // Smart tick interval based on zoom
  const targetPx = 80;
  const sec = targetPx / zoom;
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
  const step = candidates.find((c) => c >= sec) ?? 60;
  const ticks: number[] = [];
  const total = width / zoom;
  for (let t = 0; t <= total; t += step) ticks.push(t);
  return (
    <div
      onClick={onClick}
      className="absolute left-0 right-0 top-0 cursor-pointer border-b border-slate-200 bg-white text-[10px] text-slate-500"
      style={{ height: RULER_H, width }}
    >
      {ticks.map((t) => (
        <div key={t} className="absolute top-0 h-full" style={{ left: t * zoom }}>
          <div className="h-2 w-px bg-slate-300" />
          <div className="ml-1 select-none">{formatRuler(t)}</div>
        </div>
      ))}
    </div>
  );
}

function formatRuler(s: number) {
  if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  return `${m}:${sec.toFixed(0).padStart(2, "0")}`;
}

function SceneLane({ top, width, zoom }: { top: number; width: number; zoom: number }) {
  const scenes = useEditorStore((s) => s.timeline?.scenes ?? []);
  const selected = useEditorStore((s) => s.selectedSceneId);
  const select = useEditorStore((s) => s.setSelectedScene);
  return (
    <div
      className="absolute left-0 right-0 border-b border-slate-200 bg-slate-50"
      style={{ top, height: SCENE_H, width }}
    >
      {scenes.map((s) => (
        <div
          key={s.id}
          onClick={() => select(s.id)}
          className={`absolute top-1 bottom-1 cursor-pointer rounded-md border px-2 text-[11px] font-medium ${
            selected === s.id
              ? "border-indigo-400 bg-indigo-100 text-indigo-900"
              : "border-slate-300 bg-white text-slate-700 hover:border-indigo-300"
          }`}
          style={{ left: s.start * zoom, width: Math.max(s.duration * zoom, 40) }}
        >
          <div className="truncate leading-7">{s.title}</div>
        </div>
      ))}
    </div>
  );
}

function TrackHeader({ track }: { track: Track }) {
  const toggleLock = useEditorStore((s) => s.toggleTrackLock);
  const toggleHidden = useEditorStore((s) => s.toggleTrackHidden);
  const toggleMuted = useEditorStore((s) => s.toggleTrackMuted);
  return (
    <div
      className="flex items-center gap-2 border-b border-slate-200 px-3 text-xs"
      style={{ height: track.height }}
    >
      <span className="flex-1 truncate font-medium text-slate-700">{track.name}</span>
      <button onClick={() => toggleHidden(track.id)} className="text-slate-400 hover:text-slate-700">
        {track.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      {track.kind === "audio" && (
        <button onClick={() => toggleMuted(track.id)} className="text-slate-400 hover:text-slate-700">
          {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      )}
      <button onClick={() => toggleLock(track.id)} className="text-slate-400 hover:text-slate-700">
        {track.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

interface DragState {
  mode: "move" | "resize-l" | "resize-r";
  startX: number;
  origStart: number;
  origDuration: number;
}

function ClipBlock({
  clip,
  top,
  height,
  zoom,
  selected,
}: {
  clip: Clip;
  top: number;
  height: number;
  zoom: number;
  selected: boolean;
}) {
  const toggleSelect = useEditorStore((s) => s.toggleClipSelection);
  const moveClip = useEditorStore((s) => s.moveClip);
  const resizeClip = useEditorStore((s) => s.resizeClip);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState({ start: clip.start, duration: clip.duration });

  useEffect(() => {
    setPreview({ start: clip.start, duration: clip.duration });
  }, [clip.start, clip.duration]);

  const startDrag = useCallback(
    (e: React.MouseEvent, mode: DragState["mode"]) => {
      e.stopPropagation();
      if (clip.locked) return;
      setDrag({ mode, startX: e.clientX, origStart: clip.start, origDuration: clip.duration });
    },
    [clip.locked, clip.start, clip.duration],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.startX;
      const ds = dx / zoom;
      if (drag.mode === "move") {
        setPreview({ start: Math.max(0, drag.origStart + ds), duration: drag.origDuration });
      } else if (drag.mode === "resize-l") {
        const newStart = clamp(drag.origStart + ds, 0, drag.origStart + drag.origDuration - 0.1);
        const realDs = newStart - drag.origStart;
        setPreview({ start: newStart, duration: drag.origDuration - realDs });
      } else {
        setPreview({ start: drag.origStart, duration: Math.max(0.1, drag.origDuration + ds) });
      }
    };
    const onUp = () => {
      if (!drag) return;
      if (drag.mode === "move") {
        const delta = preview.start - drag.origStart;
        if (delta !== 0) moveClip(clip.id, delta);
      } else if (drag.mode === "resize-l") {
        const delta = preview.start - drag.origStart;
        if (delta !== 0) resizeClip(clip.id, "left", delta);
      } else {
        const delta = preview.duration - drag.origDuration;
        if (delta !== 0) resizeClip(clip.id, "right", delta);
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, zoom, preview, moveClip, resizeClip, clip.id]);

  const color = clipColor(clip.kind);
  const label = clipLabel(clip);
  return (
    <div
      className="absolute select-none rounded-md border text-[11px] shadow-sm"
      onMouseDown={(e) => {
        toggleSelect(clip.id, e.shiftKey);
        startDrag(e, "move");
      }}
      style={{
        top,
        left: preview.start * zoom,
        width: Math.max(preview.duration * zoom, 6),
        height,
        background: color.bg,
        borderColor: selected ? "#4f46e5" : color.border,
        outline: selected ? "2px solid #818cf8" : "none",
        cursor: clip.locked ? "not-allowed" : "grab",
        opacity: clip.hidden ? 0.4 : 1,
      }}
    >
      <div
        onMouseDown={(e) => startDrag(e, "resize-l")}
        className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l-md hover:bg-black/10"
      />
      <div className="truncate px-2 py-1 font-medium" style={{ color: color.text }}>
        {label}
      </div>
      <div
        onMouseDown={(e) => startDrag(e, "resize-r")}
        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r-md hover:bg-black/10"
      />
    </div>
  );
}

function clipColor(kind: Clip["kind"]) {
  switch (kind) {
    case "media":
      return { bg: "#eef2ff", border: "#c7d2fe", text: "#3730a3" };
    case "text":
      return { bg: "#fef3c7", border: "#fde68a", text: "#854d0e" };
    case "fact":
      return { bg: "#dcfce7", border: "#bbf7d0", text: "#166534" };
    case "subtitle":
      return { bg: "#fce7f3", border: "#fbcfe8", text: "#9d174d" };
    case "audio":
      return { bg: "#e0f2fe", border: "#bae6fd", text: "#075985" };
  }
}

function clipLabel(c: Clip) {
  switch (c.kind) {
    case "media":
      return c.mediaKind === "video" ? "Video" : "Image";
    case "text":
      return typeof c.text === "string" ? (c.text || "Text") : "Text";
    case "fact":
      return typeof c.text === "string" ? c.text : String(c.text ?? "Fact");
    case "subtitle":
      return typeof c.text === "string" ? c.text : String(c.text ?? "Subtitle");
    case "audio":
      return c.role === "voiceover" ? "Voiceover" : c.role;
  }
}
