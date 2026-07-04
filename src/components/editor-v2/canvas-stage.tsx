"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import {
  Maximize2, Minus, Pause, Play, Plus, SkipBack, SkipForward, Volume2, VolumeX,
} from "lucide-react";
import { useEditor, type StageElement, type MediaItem } from "@/lib/editor-v2/editor-store";
import { ASPECTS, effectCss, PX_PER_SECOND } from "@/lib/editor-v2/editor-data";
import { clipLayerZIndex } from "@/lib/editor-v2/layer-priority";
import { useEditorCore } from "@/lib/editor-v2/editor/store";
import { activeClipWindow } from "@/lib/editor-v2/editor/selectors";
import { UpdateClipCmd } from "@/lib/editor-v2/editor/commands";
import { mediaPool } from "@/lib/editor-v2/editor/media-pool";
import {
  buildCanvasRenderPlan,
  logCanvasRenderPlan,
  renderPlanSignature,
  type CanvasRenderItem,
  type CanvasRenderPlan,
} from "@/lib/editor-v2/editor/render-pipeline-debug";
import { STUDIO_PREVIEW_STAGE_H, type TitleStyleLike } from "@/lib/subtitles/presets";
import {
  studioScaleFromStage,
  studioSubtitleBoxStyle,
  studioSubtitleInsetStyle,
  studioSubtitleTextStyle,
  studioTitleBoxStyle,
  studioTitleInsetStyle,
  studioTitleTextStyle,
} from "@/lib/subtitles/studio-overlay-styles";
import type { SubtitleStyle } from "@/lib/subtitles/types";
import { fitElementToMediaAspect } from "@/lib/editor-v2/media-stage-fit";

type HandleId = "tl" | "tr" | "bl" | "br" | "tc" | "bc" | "lc" | "rc" | "rot";

/** Match Subtitles/Titles tab preview (max-h 480px) so font sizes align 1:1 at the same stage height. */
const BASE_STAGE_H = STUDIO_PREVIEW_STAGE_H;

export function CanvasStage() {
  const {
    playhead, aspect, setAspect,
    elements, selectedElementId, selectElement, updateElement,
    background, addElement, clips, pushHistory, transitions, tracks, settings,
    setPlayhead, playing, togglePlay,
  } = useEditor();
  const [zoom, setZoom] = useState(80);
  const [stageH, setStageH] = useState(BASE_STAGE_H);
  const [stageW, setStageW] = useState(300);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastRenderLogRef = useRef("");
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [isVertical, setIsVertical] = useState(false);

  const SNAP_TOL = 1.2; // % distance to trigger snap

  // measure stage height so text scales with the canvas
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStageH(el.clientHeight || BASE_STAGE_H);
      setStageW(el.clientWidth || 300);
    });
    ro.observe(el);
    setStageH(el.clientHeight || BASE_STAGE_H);
    setStageW(el.clientWidth || 300);
    return () => ro.disconnect();
  }, [aspect, zoom]);

  // Playback Engine owns the clock — no per-component RAF loop here.
  // The Integration Layer mirrors engine ticks back into `playhead`.

  const project = useEditorCore((s) => s.project);
  const activeWindow = useMemo(() => {
    return activeClipWindow.get(project, null, playhead);
  }, [project, playhead]);

  const current = ASPECTS.find((a) => a.id === aspect)!;
  const ratio = current.w / current.h;
  const visibleClips = useMemo(() => {
    const hidden = new Set(tracks.filter((t) => t.hidden).map((t) => t.id));
    return clips.filter((c) => !hidden.has(c.track));
  }, [clips, tracks]);
  
  const renderPlan = useMemo(
    () => buildCanvasRenderPlan(visibleClips, elements, playhead, transitions),
    [visibleClips, elements, transitions, playhead],
  );

  useEffect(() => {
    const signature = renderPlanSignature(renderPlan, playhead);
    if (signature === lastRenderLogRef.current) return;
    lastRenderLogRef.current = signature;
    logCanvasRenderPlan(renderPlan, playhead);
  }, [renderPlan, playhead]);

  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize" | "rotate";
    handle?: HandleId;
    startX: number;
    startY: number;
    rect: DOMRect;
    el: StageElement;
    hasMoved?: boolean;
  } | null>(null);

  const onElementPointerDown = (e: ReactPointerEvent, el: StageElement) => {
    e.stopPropagation();
    
    // Check if the element's track is locked
    const state = useEditor.getState();
    const clip = state.clips.find((c) => c.elementId === el.id);
    const track = clip ? state.tracks.find((t) => t.id === clip.track) : null;
    if ((track as any)?.locked) {
      toast.message("Track is locked");
      return;
    }

    selectElement(el.id);
    if (clip?.frozen) {
      // Element is selected but return early so drag state is not established.
      return;
    }
    pushHistory();
    const stageEl = stageRef.current;
    if (!stageEl) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: el.id, mode: "move", startX: e.clientX, startY: e.clientY, rect: stageEl.getBoundingClientRect(), el };
  };

  const onHandlePointerDown = (e: ReactPointerEvent, el: StageElement, handle: HandleId) => {
    e.stopPropagation();

    // Check if the element's track is locked
    const state = useEditor.getState();
    const clip = state.clips.find((c) => c.elementId === el.id);
    const track = clip ? state.tracks.find((t) => t.id === clip.track) : null;
    if ((track as any)?.locked || clip?.frozen) {
      return;
    }

    selectElement(el.id);
    pushHistory();
    const stageEl = stageRef.current;
    if (!stageEl) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      id: el.id, mode: handle === "rot" ? "rotate" : "resize",
      handle, startX: e.clientX, startY: e.clientY, rect: stageEl.getBoundingClientRect(), el,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.hasMoved = true;
    const dxPct = ((e.clientX - d.startX) / d.rect.width) * 100;
    const dyPct = ((e.clientY - d.startY) / d.rect.height) * 100;

    if (d.mode === "move") {
      let nx = d.el.x + dxPct;
      let ny = d.el.y + dyPct;
      const others = elements.filter((o) => o.id !== d.id);
      const sx = snap(nx, d.el.w, others, "x");
      const sy = snap(ny, d.el.h, others, "y");
      nx = sx.value;
      ny = sy.value;
      setGuides({ v: sx.guides, h: sy.guides });
      updateElement(d.id, {
        x: clamp(nx, -d.el.w + 5, 100 - 5),
        y: clamp(ny, -d.el.h + 5, 100 - 5),
      });
      return;
    }

    if (d.mode === "resize" && d.handle) {
      let { x, y, w, h } = d.el;
      const minW = 4, minH = 4;
      const h0 = d.handle;
      const others = elements.filter((o) => o.id !== d.id);
      if (h0 === "br" || h0 === "rc" || h0 === "tr") {
        w = Math.max(minW, d.el.w + dxPct);
        const s = snapEdge(x + w, others, "x");
        if (s.snapped) { w = s.value - x; }
        setGuides((g) => ({ ...g, v: s.guides }));
      }
      if (h0 === "bl" || h0 === "lc" || h0 === "tl") {
        const nw = Math.max(minW, d.el.w - dxPct);
        x = d.el.x + (d.el.w - nw); w = nw;
        const s = snapEdge(x, others, "x");
        if (s.snapped) { w = (x + w) - s.value; x = s.value; }
        setGuides((g) => ({ ...g, v: s.guides }));
      }
      if (h0 === "br" || h0 === "bc" || h0 === "bl") {
        h = Math.max(minH, d.el.h + dyPct);
        const s = snapEdge(y + h, others, "y");
        if (s.snapped) { h = s.value - y; }
        setGuides((g) => ({ ...g, h: s.guides }));
      }
      if (h0 === "tr" || h0 === "tc" || h0 === "tl") {
        const nh = Math.max(minH, d.el.h - dyPct);
        y = d.el.y + (d.el.h - nh); h = nh;
        const s = snapEdge(y, others, "y");
        if (s.snapped) { h = (y + h) - s.value; y = s.value; }
        setGuides((g) => ({ ...g, h: s.guides }));
      }

      // Proportional scaling by default for media, or if Shift is held for others. Invert Shift for media.
      const isMedia = d.el.kind === "image" || d.el.kind === "video";
      const shouldLockAspect = isMedia ? !e.shiftKey : e.shiftKey;

      if (shouldLockAspect && ["tl", "tr", "bl", "br"].includes(h0)) {
        const origAspect = d.el.w / d.el.h;
        // Determine whether width or height change was larger proportionally
        if (Math.abs(dxPct) / d.el.w > Math.abs(dyPct) / d.el.h) {
          // Adjust height to match width
          const newH = w / origAspect;
          if (h0 === "tl" || h0 === "tr") {
            y = d.el.y + (d.el.h - newH); // keep bottom edge fixed
          }
          h = newH;
        } else {
          // Adjust width to match height
          const newW = h * origAspect;
          if (h0 === "tl" || h0 === "bl") {
            x = d.el.x + (d.el.w - newW); // keep right edge fixed
          }
          w = newW;
        }
      }

      const patch: Partial<StageElement> = { x, y, w, h };
      if (d.el.kind === "text" && d.el.fontSize && ["tl", "tr", "bl", "br"].includes(h0)) {
        const ratioH = h / d.el.h;
        patch.fontSize = Math.max(8, Math.round(d.el.fontSize * ratioH));
      }
      updateElement(d.id, patch);
      return;
    }

    if (d.mode === "rotate") {
      const cx = d.rect.left + ((d.el.x + d.el.w / 2) / 100) * d.rect.width;
      const cy = d.rect.top + ((d.el.y + d.el.h / 2) / 100) * d.rect.height;
      let angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      
      if (e.shiftKey) {
        // Snap to 45-degree increments if Shift is held
        const snapInterval = 45;
        const closestSnap = Math.round(angle / snapInterval) * snapInterval;
        angle = closestSnap;
      }
      
      updateElement(d.id, { rotation: angle });
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (d && d.hasMoved) {
      // Emit a command-based transform update so undo/redo restores Canvas + Timeline.
      const finalEl = useEditor.getState().elements.find((x) => x.id === d.id);
      if (finalEl) {
        const core = useEditorCore.getState();
        const linkedClips = core.project.clips.filter((c) => c.elementId === finalEl.id);
        const transform = {
          x: finalEl.x,
          y: finalEl.y,
          w: finalEl.w,
          h: finalEl.h,
          rotation: finalEl.rotation,
          opacity: finalEl.opacity,
        };
        for (const c of linkedClips) {
          core.run(new UpdateClipCmd(c.id, { transform }));
        }
      }
    }
    dragRef.current = null;
    setGuides({ v: [], h: [] });
  };

  // Snap a moving element's position so left/center/right edges align to stage or other elements.
  function snap(pos: number, size: number, others: StageElement[], axis: "x" | "y") {
    if (!settings.snapping) return { value: pos, guides: [] };
    const targets: number[] = [0, 50, 100];
    for (const o of others) {
      if (axis === "x") targets.push(o.x, o.x + o.w / 2, o.x + o.w);
      else targets.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    const edges = [pos, pos + size / 2, pos + size]; // start, center, end
    let bestDelta = Infinity;
    let bestAdjust = 0;
    const guides: number[] = [];
    for (const e of edges) {
      for (const t of targets) {
        const diff = t - e;
        if (Math.abs(diff) < Math.abs(bestDelta)) {
          bestDelta = diff;
          bestAdjust = diff;
        }
      }
    }
    let value = pos;
    if (Math.abs(bestDelta) <= SNAP_TOL) {
      value = pos + bestAdjust;
      const snappedEdges = [value, value + size / 2, value + size];
      for (const e of snappedEdges) {
        for (const t of targets) {
          if (Math.abs(t - e) < 0.05) { guides.push(t); break; }
        }
      }
    }
    return { value, guides: Array.from(new Set(guides)) };
  }

  // Snap a single edge (during resize).
  function snapEdge(pos: number, others: StageElement[], axis: "x" | "y") {
    if (!settings.snapping) return { value: pos, snapped: false, guides: [] };
    const targets: number[] = [0, 50, 100];
    for (const o of others) {
      if (axis === "x") targets.push(o.x, o.x + o.w / 2, o.x + o.w);
      else targets.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    let best = Infinity, bestT = pos;
    for (const t of targets) {
      const d2 = Math.abs(t - pos);
      if (d2 < best) { best = d2; bestT = t; }
    }
    if (best <= SNAP_TOL) return { value: bestT, snapped: true, guides: [bestT] };
    return { value: pos, snapped: false, guides: [] };
  }


  const onStageDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("application/x-media");
    if (!raw) return;
    e.preventDefault();
    const m = JSON.parse(raw) as MediaItem;
    if (m.kind === "audio") return;
    pushHistory();
    const elId = addElement({
      kind: m.kind === "video" ? "video" : "image",
      x: 6, y: 6, w: 88, h: 88, rotation: 0, color: "#fff",
      src: m.src, opacity: 100, effect: "none", fit: "contain",
    });
    const state = useEditor.getState();
    const created = state.clips.find((c) => c.elementId === elId);
    if (created) {
      const seconds = m.duration > 0 ? m.duration : 5;
      const width = Math.max(60, seconds * PX_PER_SECOND);
      const newTrack = state.addTrack(created.kind);
      const start = Math.max(0, Math.round(playhead * PX_PER_SECOND));
      state.updateClip(created.id, {
        start, width, track: newTrack, name: m.name, thumb: m.thumb ?? m.src,
      });
    }
    void fitElementToMediaAspect(elId, m.src, m.kind === "video" ? "video" : "image", aspect, updateElement);
  };

  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {
        toast.error("Could not enter fullscreen");
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col bg-canvas relative min-w-0 min-h-0"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Aspect selector (kept) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1 rounded-full bg-panel/70 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl shadow-black/40">
        {ASPECTS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAspect(a.id)}
            className={`relative px-3 py-1 text-[10px] font-medium rounded-full transition ${
              aspect === a.id ? "text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {aspect === a.id && (
              <motion.div layoutId="aspect-pill" className="absolute inset-0 bg-white/10 rounded-full" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
            )}
            <span className="relative">{a.preset} · {a.id}</span>
          </button>
        ))}
      </div>

      {/* Stage */}
      <div className="flex-1 w-full flex items-center justify-center p-4 min-h-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-black overflow-hidden relative">
        <motion.div
          layout
          key={aspect}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
          className="relative"
          style={{
            aspectRatio: ratio,
            maxWidth: `${zoom}%`,
            maxHeight: `${zoom}%`,
            width: ratio >= 1 ? `${zoom}%` : "auto",
            height: ratio < 1 ? `${zoom}%` : "auto",
          }}
        >
          <div
            ref={stageRef}
            onPointerDown={() => selectElement(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onStageDrop}
            className="w-full h-full ring-1 ring-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] overflow-hidden relative cursor-default"
            style={{ background }}
          >
            {renderPlan.renderedItems.map((item) => (
              <StageElementView
                key={`${item.clip.id}:${item.element.id}`}
                item={item}
                stageW={stageW}
                stageH={stageH}
                selected={item.element.id === selectedElementId}
                onPointerDown={(e) => onElementPointerDown(e, item.element)}
                onHandlePointerDown={(e, h) => onHandlePointerDown(e, item.element, h)}
              />
            ))}
            
            {/* Smart alignment guides */}
            {settings.showGuides && (
              <div className="absolute inset-0 pointer-events-none">
                {guides.v.map((v, i) => (
                  <div
                    key={`v-${i}-${v}`}
                    className="absolute top-0 bottom-0"
                    style={{ left: `${v}%`, width: 1, background: "#38bdf8", boxShadow: "0 0 4px rgba(56,189,248,0.5)" }}
                  />
                ))}
                {guides.h.map((h, i) => (
                  <div
                    key={`h-${i}-${h}`}
                    className="absolute left-0 right-0"
                    style={{ top: `${h}%`, height: 1, background: "#38bdf8", boxShadow: "0 0 4px rgba(56,189,248,0.5)" }}
                  />
                ))}
              </div>
            )}
          </div>

        </motion.div>
      </div>

      {/* Playback bar */}
      <motion.div
        layout
        drag
        dragMomentum={false}
        dragConstraints={containerRef}
        onDrag={(e, info) => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const x = info.point.x - rect.left;
          const isNearEdge = x < 150 || x > rect.width - 150;
          if (isNearEdge !== isVertical) setIsVertical(isNearEdge);
        }}
        className={`absolute bottom-3 z-30 flex ${isVertical ? "flex-col items-center py-4 px-2 gap-3" : "items-center gap-4 px-3 py-2"} rounded-[2rem] bg-panel/80 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl shadow-black/50 cursor-grab active:cursor-grabbing`}
        style={{ left: "50%", x: "-50%" }}
      >
        <motion.div layout className={`flex ${isVertical ? "flex-col items-center" : "items-center"} gap-1`}>
          <button onClick={() => setPlayhead(Math.max(0, playhead - 1))} className="p-1.5 text-zinc-400 hover:text-white transition" title="Back">
            <SkipBack className="size-4" />
          </button>
          <button
            onClick={togglePlay}
            className="size-8 grid place-items-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition shadow-lg shadow-white/10"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <button onClick={() => setPlayhead(playhead + 1)} className="p-1.5 text-zinc-400 hover:text-white transition" title="Forward">
            <SkipForward className="size-4" />
          </button>
        </motion.div>
        <motion.span layout className={`text-[10px] font-mono tabular-nums text-zinc-300 text-center ${isVertical ? "" : "min-w-[64px]"}`}>
          {formatTC(playhead, useEditor.getState().settings.fps)}
        </motion.span>
        <motion.div layout className={isVertical ? "h-px w-6 bg-white/10 my-1 self-center" : "w-px h-4 bg-white/10"} />
        <motion.button layout onClick={useEditor((s) => s.toggleGlobalMute)} className="text-zinc-400 hover:text-white transition" title="Volume">
          {useEditor((s) => s.globalMuted) ? <VolumeX className="size-3.5 mx-auto" /> : <Volume2 className="size-3.5 mx-auto" />}
        </motion.button>
        <motion.div layout className={`flex ${isVertical ? "flex-col-reverse items-center mt-1" : "items-center"} gap-1.5`}>
          <button onClick={() => setZoom(Math.max(20, zoom - 8))} className="text-zinc-500 hover:text-white transition"><Minus className="size-3" /></button>
          <span className="text-[10px] font-mono text-center text-zinc-300">{zoom}%</span>
          <button onClick={() => setZoom(Math.min(140, zoom + 8))} className="text-zinc-500 hover:text-white transition"><Plus className="size-3" /></button>
        </motion.div>
        <motion.button layout onClick={toggleFullscreen} className={`text-zinc-400 hover:text-white transition ${isVertical ? "mt-1" : ""}`} title="Fullscreen">
          <Maximize2 className="size-3.5 mx-auto" />
        </motion.button>
      </motion.div>

      {/*
        Audio playback for ALL media (audio clips AND video clip soundtracks) is
        owned by the Media Sync Controller via the Media Element Pool. We do NOT
        spawn parallel <audio>/<video> elements here — that path used to double
        every sound.
      */}
    </div>
  );
}

function elementToSubtitleStyle(el: StageElement): SubtitleStyle {
  return {
    fontFamily: el.fontFamily ?? "Inter, system-ui, sans-serif",
    fontStyle: el.italic ? "italic" : "normal",
    fontSize: el.fontSize ?? 30,
    fontWeight: el.fontWeight ?? 700,
    color: el.color,
    backgroundColor: el.backgroundColor ?? "transparent",
    position: "bottom",
    animation: (el.animation as SubtitleStyle["animation"]) ?? "none",
    highlightColor: el.highlightColor ?? "#fbbf24",
    stroke: el.stroke ?? false,
    strokeColor: el.strokeColor ?? "#000000",
    strokeWidth: el.strokeWidth ?? 2,
    shadow: el.shadow ?? false,
  };
}

function elementToTitleStyle(el: StageElement): TitleStyleLike {
  const bgMatch = el.backgroundColor?.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
  const backgroundOpacity = bgMatch ? Math.round(parseFloat(bgMatch[1]) * 100) : 0;
  return {
    fontFamily: el.fontFamily,
    fontSize: el.fontSize,
    fontWeight: el.fontWeight,
    color: el.color,
    backgroundOpacity,
    fontStyle: el.italic ? "italic" : "normal",
    textDecoration: el.underline ? "underline" : "none",
    letterSpacing: el.letterSpacing,
    shadow: el.shadow ?? false,
  };
}

function StudioTextContent({
  item,
  scaleW,
  scaleH,
}: {
  item: CanvasRenderItem;
  scaleW: number;
  scaleH: number;
}) {
  const el = item.element;
  const absTime = (item.clip.start / PX_PER_SECOND) + item.localTime;
  const absMs = absTime * 1000;
  const words = el.words ?? [];
  const activeWordIndex = words.findIndex((w) => absMs >= w.startMs && absMs < w.endMs);

  let content: React.ReactNode = el.text || "Text";

  if (
    el.studioOverlay === "subtitle"
    && (el.animation === "karaoke" || el.animation === "highlight" || el.animation === "word_pop")
    && words.length > 0
  ) {
    content = words.map((w, i) => (
      <span
        key={`${w.word}-${i}`}
        style={{
          transition: "color 150ms, opacity 150ms",
          color: i === activeWordIndex ? (el.highlightColor || el.color) : undefined,
          opacity: el.animation === "word_pop" && i > activeWordIndex ? 0.45 : 1,
        }}
      >
        {w.word}{" "}
      </span>
    ));
  }

  if (el.studioOverlay === "subtitle") {
    const ss = elementToSubtitleStyle(el);
    return (
      <div style={{ ...studioSubtitleBoxStyle(scaleW, scaleH), ...studioSubtitleTextStyle(ss, scaleH) }}>
        {content}
      </div>
    );
  }

  if (el.studioOverlay === "title") {
    const ts = elementToTitleStyle(el);
    return (
      <div style={{ ...studioTitleBoxStyle(scaleW, scaleH), ...studioTitleTextStyle(ts, scaleH) }}>
        {el.text || "Text"}
      </div>
    );
  }

  return null;
}

function StageElementView({
  item, stageW, stageH, selected, onPointerDown, onHandlePointerDown,
}: {
  item: CanvasRenderItem;
  stageW: number;
  stageH: number;
  selected: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onHandlePointerDown: (e: ReactPointerEvent, handle: HandleId) => void;
}) {
  const { element: el } = item;
  const handles: HandleId[] = ["tl", "tr", "bl", "br", "tc", "bc", "lc", "rc"];
  const handlePos: Record<HandleId, string> = {
    tl: "-top-1.5 -left-1.5 cursor-nwse-resize",
    tr: "-top-1.5 -right-1.5 cursor-nesw-resize",
    bl: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
    br: "-bottom-1.5 -right-1.5 cursor-nwse-resize",
    tc: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
    bc: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
    lc: "top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize",
    rc: "top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize",
    rot: "",
  };

  const ts = item.transitionStyle;
  const baseTransform = `rotate(${el.rotation}deg)`;
  const transform = ts?.transform ? `${baseTransform} ${ts.transform}` : baseTransform;
  const baseOpacity = (el.opacity ?? 100) / 100;
  const opacity = ts?.opacity != null ? baseOpacity * ts.opacity : baseOpacity;
  const { scaleW, scaleH } = studioScaleFromStage(stageW, stageH);
  const elementScale = stageH / BASE_STAGE_H;

  if (el.studioOverlay) {
    const insetStyle =
      el.studioOverlay === "subtitle"
        ? studioSubtitleInsetStyle(scaleW, scaleH)
        : studioTitleInsetStyle(scaleW, scaleH);

    return (
      <div
        onPointerDown={onPointerDown}
        data-rendered-clip-id={item.clip.id}
        data-rendered-element-id={el.id}
        data-rendered-asset-id={item.assetId}
        className="absolute select-none"
        style={{
          ...insetStyle,
          transform,
          cursor: item.clip.frozen ? "not-allowed" : "move",
          opacity,
          zIndex: clipLayerZIndex(item.clip.kind),
          transformOrigin: ts?.transformOrigin,
          clipPath: ts?.clipPath,
        pointerEvents: "auto",
        transition: "none",
      }}
    >
      <StudioTextContent item={item} scaleW={scaleW} scaleH={scaleH} />
        {selected && (
          <div className={`absolute inset-0 pointer-events-none border-2 ${item.clip.frozen ? "border-sky-500/70" : "border-brand/70"} rounded-lg`} />
        )}
      </div>
    );
  }

  return (
    <div
      onPointerDown={onPointerDown}
      data-rendered-clip-id={item.clip.id}
      data-rendered-element-id={el.id}
      data-rendered-asset-id={item.assetId}
      className="absolute select-none"
      style={{
        left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
        transform, cursor: item.clip.frozen ? "not-allowed" : "move",
        opacity,
        zIndex: clipLayerZIndex(item.clip.kind),
        transformOrigin: ts?.transformOrigin,
        clipPath: ts?.clipPath,
        pointerEvents: "auto",
        transition: "none",
      }}
    >
      <ElementBody item={item} scale={elementScale} />
      {selected && (
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute inset-0 border-2 ${item.clip.frozen ? "border-sky-500/70" : "border-brand/70"}`} />
          {!item.clip.frozen && (
            <>
              {handles.map((p) => (
                <span
                  key={p}
                  onPointerDown={(e) => onHandlePointerDown(e, p)}
                  className={`absolute ${handlePos[p]} size-3 bg-white border border-brand rounded-sm pointer-events-auto`}
                />
              ))}
              <span
                onPointerDown={(e) => onHandlePointerDown(e, "rot")}
                className="absolute -top-7 left-1/2 -translate-x-1/2 size-3 rounded-full border-2 border-brand bg-background pointer-events-auto cursor-grab"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ElementBody({ item, scale }: {
  item: CanvasRenderItem; scale: number;
}) {
  const el = item.element;
  const filter = effectCss(el.effect);
  if (el.kind === "text") {
    const absTime = (item.clip.start / PX_PER_SECOND) + item.localTime;
    const absMs = absTime * 1000;
    const words = el.words ?? [];
    const activeWordIndex = words.findIndex(
      (w) => absMs >= w.startMs && absMs < w.endMs,
    );

    let content: React.ReactNode = el.text || "Text";

    if ((el.animation === "karaoke" || el.animation === "highlight" || el.animation === "word_pop") && words.length > 0) {
      content = words.map((w, i) => (
        <span
          key={`${w.word}-${i}`}
          style={{
            transition: "color 150ms, opacity 150ms",
            color: i === activeWordIndex ? (el.highlightColor || el.color) : undefined,
            opacity: el.animation === "word_pop" && i > activeWordIndex ? 0.45 : 1,
          }}
        >
          {w.word}{" "}
        </span>
      ));
    }

    const strokePx = (el.strokeWidth || 2) * scale * 0.55;
    const textScale = item.clip.kind === "subtitle" ? 0.55 : item.clip.kind === "text" ? 0.34 : 0.55;
    return (
      <div
        className="w-full h-full flex px-2 leading-tight whitespace-pre-wrap"
        style={{
          color: el.color,
          fontWeight: el.fontWeight ?? 700,
          fontSize: `${(el.fontSize ?? 32) * scale * textScale}px`,
          fontFamily: el.fontFamily ?? "Inter, system-ui, sans-serif",
          fontStyle: el.italic ? "italic" : "normal",
          textDecoration: el.underline ? "underline" : "none",
          letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
          textAlign: el.align ?? "center",
          alignItems: "center",
          justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center",
          backgroundColor: el.backgroundColor || undefined,
          borderRadius: el.backgroundColor ? 12 : undefined,
          textShadow: el.shadow ? "0 2px 8px rgba(0,0,0,0.65)" : undefined,
          WebkitTextStroke: el.stroke ? `${strokePx}px ${el.strokeColor || "#000"}` : undefined,
          paintOrder: "stroke fill",
        }}
      >
        <span className="w-full" style={{ textAlign: el.align ?? "center" }}>
          {content}
        </span>
      </div>
    );
  }
  if (el.kind === "sticker") {
    // el.h is a percentage of stage height, scale is stage height / 100.
    // So el.h * scale is the actual physical pixel height of the bounding box.
    return <div className="w-full h-full grid place-items-center" style={{ fontSize: `${el.h * scale * 0.8}px` }}>{el.emoji}</div>;
  }
  if (el.kind === "image") {
    const objectFitClass = el.fit === "contain" ? "object-contain" : "object-cover";
    return <img src={el.src || undefined} alt="" className={`w-full h-full ${objectFitClass}`} style={{ filter: filter === "none" ? undefined : filter }} draggable={false} />;
  }
  if (el.kind === "video") {
    return <VideoBody src={el.src} filter={filter} item={item} fit={el.fit} />;
  }
  if (el.kind === "rect") return <div className="w-full h-full" style={{ background: el.color, filter: filter === "none" ? undefined : filter }} />;
  if (el.kind === "ellipse") return <div className="w-full h-full rounded-full" style={{ background: el.color, filter: filter === "none" ? undefined : filter }} />;
  if (el.kind === "triangle") {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full" style={{ filter: filter === "none" ? undefined : filter }}>
        <polygon points="50,4 96,96 4,96" fill={el.color} />
      </svg>
    );
  }
  if (el.kind === "shape") {
    const sType = el.shapeType ?? "cloud";
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full" style={{ filter: filter === "none" ? undefined : filter }}>
        {sType === "line" && (
          <line x1="5" y1="50" x2="95" y2="50" stroke={el.color} strokeWidth="10" strokeLinecap="round" />
        )}
        {sType === "cloud" && (
          <path d="M 25,60 A 20,20 0 0,1 45,40 A 25,25 0 0,1 85,45 A 20,20 0 0,1 85,85 H 25 A 20,20 0 0,1 25,60 Z" fill={el.color} />
        )}
        {sType === "star" && (
          <polygon points="50,5 64,36 98,36 70,57 81,91 50,70 19,91 30,57 2,36 36,36" fill={el.color} />
        )}
        {sType === "arrow" && (
          <polygon points="10,35 60,35 60,15 90,50 60,85 60,65 10,65" fill={el.color} />
        )}
        {sType === "pentagon" && (
          <polygon points="50,5 95,38 78,92 22,92 5,38" fill={el.color} />
        )}
        {sType === "hexagon" && (
          <polygon points="50,5 90,28 90,72 50,95 10,72 10,28" fill={el.color} />
        )}
        {sType === "heart" && (
          <path d="M50,30 C50,30 50,15 35,15 C18,15 18,37 18,37 C18,58 50,82 50,85 C50,82 82,58 82,37 C82,37 82,15 65,15 C50,15 50,30 50,30 Z" fill={el.color} />
        )}
        {sType === "bubble" && (
          <path d="M10,15 h80 v50 H55 L35,85 V65 H10 Z" fill={el.color} />
        )}
      </svg>
    );
  }
  return <div className="w-full h-full bg-white/10" />;
}

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }

function VideoBody({ src, filter, item, fit }: {
  src?: string; filter: string; item: CanvasRenderItem; fit?: "cover" | "contain";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLMediaElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = mediaPool.get(item.clip.id);
    if (!el || el.tagName !== "VIDEO") return;

    const originalParent = el.parentElement;
    containerRef.current.appendChild(el);
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.objectFit = fit ?? "cover";
    elRef.current = el;

    return () => {
      if (originalParent && el.isConnected) {
        originalParent.appendChild(el);
      }
      elRef.current = null;
    };
  }, [item.clip.id]);

  useEffect(() => {
    if (elRef.current) {
      elRef.current.style.filter = filter === "none" ? "none" : filter;
      elRef.current.style.opacity = "1";
    }
  }, [filter]);

  const playing = useEditor((s) => s.playing);

  useEffect(() => {
    const el = elRef.current;
    if (!el || el.tagName !== "VIDEO") return;
    // During playback the Media Sync Controller owns the clock and calls play()
    // on the active clip; seeking here too makes two controllers fight over the
    // same element every frame, which is the transition/playback stutter. Only
    // seek while paused (scrubbing) or for a clip that isn't the one playing.
    if (playing) return;
    const target = Math.max(0, item.localTime);
    try {
      if (Math.abs(el.currentTime - target) > 0.05) {
        el.currentTime = target;
      }
    } catch {
      /* ignore seek errors while buffering */
    }
  }, [item.localTime, item.clip.id, playing]);

  return <div ref={containerRef} className="w-full h-full overflow-hidden" />;
}

function VisualDebugOverlay({ plan, playhead }: { plan: CanvasRenderPlan; playhead: number }) {
  const active = plan.renderedItems[0];
  return (
    <div className="absolute left-2 top-2 z-30 pointer-events-none max-w-[70%] rounded-md bg-black/75 px-2 py-1 font-mono text-[10px] leading-snug text-white shadow-lg ring-1 ring-white/20">
      <div>Active Clip ID: {active?.clip.id ?? "none"}</div>
      <div>Rendered Element ID: {active?.element.id ?? "none"}</div>
      <div>Asset ID: {active?.assetId ?? "none"}</div>
      <div>Track ID: {active?.clip.track ?? "none"}</div>
      <div>Current Time: {playhead.toFixed(2)}s</div>
      <div>Local Time: {active?.localTime.toFixed(2) ?? "0.00"}s</div>
    </div>
  );
}

function formatTC(s: number, fps: number) {
  const total = Math.max(0, s);
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = Math.floor(total % 60).toString().padStart(2, "0");
  const ff = Math.floor((total * fps) % fps).toString().padStart(2, "0");
  return `${mm}:${ss}:${ff}`;
}

// AudioPlayers / AudioClipPlayer were removed in the audio-correctness pass.
// Audio playback is centralised in src/lib/editor/media-sync.ts so each clip
// produces exactly one active HTMLMediaElement.

