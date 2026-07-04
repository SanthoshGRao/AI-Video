"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import {
  Copy, Magnet, Scissors, Eye, Plus, Minus,
  Volume2, VolumeX, Video as VideoIcon, Type as TypeIcon, Trash2, Trash, Film,
  Image as ImageIcon, Square, Snowflake, Lock, LockOpen,
} from "lucide-react";
import { useEditor, type MediaItem, type TransitionId } from "@/lib/editor-v2/editor-store";
import { PX_PER_SECOND, TRANSITIONS, type Clip, type TrackKind } from "@/lib/editor-v2/editor-data";
import { fitElementToMediaAspect } from "@/lib/editor-v2/media-stage-fit";
import { TIMELINE, clipChrome } from "@/lib/editor-v2/timeline-theme";
import { sortTracksForDisplay } from "@/lib/editor-v2/layer-priority";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { assetManager, type AssetRecord } from "@/lib/editor-v2/editor/asset-manager";

const RULER_TICKS = 60;
const MIN_CLIP_WIDTH = 20;
const MIN_SUBTITLE_CLIP_WIDTH = 8;
const SNAP_PX = 8;
const ROW_HEIGHT = 48;

type DragMode = "move" | "trim-left" | "trim-right";

interface ClipDragState {
  id: string;
  mode: DragMode;
  startX: number;
  startY: number;
  origStart: number;
  origWidth: number;
  origTrack: number;
  origMediaStart?: number;
  moved: boolean;
  createdTrackId?: number;
}

export function Timeline() {
  const {
    playhead, setPlayhead, playing, togglePlay, aspect, clips, selectedClipIds, selectClip, zoom, setZoom,
    removeClip, addClip, updateClip, transitions, addTransition, removeTransition,
    selectTransition, selectedTransitionId,
    tracks, ensureTrackForKind, addTrack, addElement, cleanupEmptyTracks,
    pushHistory, duplicateClip, splitClipAtPlayhead,
    settings, setSetting,
  } = useEditor();
  const gridRef = useRef<HTMLDivElement>(null);
  const seekDragRef = useRef(false);
  const clipDragRef = useRef<ClipDragState | null>(null);
  const [dragTrack, setDragTrack] = useState<number | null>(null);
  const [snapGuide, setSnapGuide] = useState<number | null>(null);

  const selectedClipId = selectedClipIds[0] ?? null;

  useEffect(() => {
    // Keeps track list tidy: 1 empty track per kind, removes extra empty tracks
    cleanupEmptyTracks();
  }, [clips, cleanupEmptyTracks]);

  const pxScale = PX_PER_SECOND * zoom;
  /** Top-to-bottom: subtitles → text → video (matches canvas compositing). */
  const displayTracks = sortTracksForDisplay(tracks);

  const seekFromEvent = (e: ReactPointerEvent | PointerEvent) => {
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const px = Math.max(0, e.clientX - rect.left);
    setPlayhead(px / pxScale);
  };

  const onSeekDown = (e: ReactPointerEvent) => {
    seekDragRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSnapGuide(null);
    if (!onGridPointerUpRef.current) {
      window.addEventListener("pointerup", onGridPointerUp);
    }
    onGridPointerUpRef.current = onGridPointerUp;
    seekFromEvent(e);
  };

  const startClipDrag = (e: ReactPointerEvent, clip: Clip, mode: DragMode) => {
    const track = tracks.find(t => t.id === clip.track);
    if ((track as { locked?: boolean })?.locked) return toast.message("Track is locked");
    if (clip.frozen) return toast.message("Element is frozen");
    e.stopPropagation();
    e.preventDefault();
    selectClip(clip.id);
    pushHistory();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    clipDragRef.current = {
      id: clip.id, mode,
      startX: e.clientX, startY: e.clientY,
      origStart: clip.start, origWidth: clip.width, origTrack: clip.track,
      origMediaStart: clip.mediaStart,
      moved: false,
    };
    if (!onGridPointerUpRef.current) {
      window.addEventListener("pointerup", onGridPointerUp);
    }
    onGridPointerUpRef.current = onGridPointerUp;
  };

  const onGridPointerMove = (e: ReactPointerEvent) => {
    if (seekDragRef.current) { seekFromEvent(e); return; }
    const d = clipDragRef.current;
    const grid = gridRef.current;
    if (!d || !grid) return;
    const dxPx = (e.clientX - d.startX) / zoom;
    const dyPx = e.clientY - d.startY;
    if (Math.abs(e.clientX - d.startX) + Math.abs(dyPx) > 3) d.moved = true;

    const clip = clips.find((c) => c.id === d.id);
    if (!clip) return;

    const playheadPx = useEditor.getState().playhead * PX_PER_SECOND;

    if (d.mode === "move") {
      const origIdx = displayTracks.findIndex((t) => t.id === d.origTrack);
      const rowDelta = Math.round(dyPx / ROW_HEIGHT);
      const targetIdx = clamp(origIdx + rowDelta, 0, displayTracks.length - 1);
      const targetRow = displayTracks[targetIdx];
      let targetTrackId = clip.track;
      if (targetRow && targetRow.kind === clip.kind) {
        targetTrackId = targetRow.id;
      } else if (targetRow && targetRow.kind !== clip.kind && Math.abs(rowDelta) >= 1) {
        if (d.createdTrackId == null) {
          d.createdTrackId = addTrack(clip.kind);
        }
        targetTrackId = d.createdTrackId;
      }
      let intendedStart = Math.max(0, d.origStart + dxPx);
      const points = collectSnapPoints(clip, clips, playheadPx, settings.snapping);
      let guide: number | null = null;
      if (settings.snapping) {
        const startSnap = snapValue(intendedStart, points, zoom);
        const endSnap = snapValue(intendedStart + clip.width, points, zoom);
        if (startSnap !== null) { intendedStart = startSnap; guide = startSnap; }
        else if (endSnap !== null) { intendedStart = endSnap - clip.width; guide = endSnap; }
      }

      // Check for swapping/moving apart
      if (clip.kind !== "subtitle") {
        const others = clips.filter((c) => c.track === targetTrackId && c.id !== clip.id);
        const centerA = intendedStart + clip.width / 2;
        let swapClip: Clip | null = null;

        for (const o of others) {
          if (o.frozen) continue;
          const trackO = tracks.find(t => t.id === o.track);
          if (trackO?.locked) continue;

          const centerO = o.start + o.width / 2;
          const hasOverlap = intendedStart < o.start + o.width && intendedStart + clip.width > o.start;
          if (hasOverlap) {
            if (clip.track !== targetTrackId) {
              swapClip = o;
              break;
            } else {
              const movingRight = d.origStart < o.start;
              if (movingRight && centerA > centerO) {
                swapClip = o;
                break;
              } else if (!movingRight && centerA < centerO) {
                swapClip = o;
                break;
              }
            }
          }
        }

        if (swapClip) {
          const oldOrigStart = d.origStart;
          const oldOrigTrack = d.origTrack;

          // Swap track and start values in store
          updateClip(swapClip.id, { start: oldOrigStart, track: oldOrigTrack });
          updateClip(clip.id, { start: swapClip.start, track: targetTrackId });

          // Update drag reference continuously
          const deltaX = swapClip.start - oldOrigStart;
          d.origStart = swapClip.start;
          d.origTrack = targetTrackId;
          d.startX += deltaX * zoom;
          setSnapGuide(null);
          return;
        }
      }

      let newStart = intendedStart;
      if (clip.kind !== "subtitle") {
        newStart = resolveClipPosition(newStart, clip.width, clip.id, targetTrackId, clips);
      }
      setSnapGuide(guide);
      updateClip(d.id, { start: newStart, track: targetTrackId });
      return;
    }

    if (d.mode === "trim-right") {
      let newWidth = Math.max(MIN_CLIP_WIDTH, d.origWidth + dxPx);
      const next = clips
        .filter((c) => c.track === clip.track && c.id !== clip.id && c.start >= d.origStart)
        .sort((a, b) => a.start - b.start)[0];
      if (next) newWidth = Math.min(newWidth, next.start - d.origStart);
      let guide: number | null = null;
      if (settings.snapping) {
        const targetEnd = d.origStart + newWidth;
        const snapped = snapValue(targetEnd, collectSnapPoints(clip, clips, playheadPx, settings.snapping), zoom);
        if (snapped !== null) { newWidth = snapped - d.origStart; guide = snapped; }
      }
      setSnapGuide(guide);
      updateClip(d.id, { width: Math.max(MIN_CLIP_WIDTH, newWidth) });
      return;
    }

    if (d.mode === "trim-left") {
      let newStart = Math.max(0, d.origStart + dxPx);
      const newEnd = d.origStart + d.origWidth;
      const prev = [...clips]
        .filter((c) => c.track === clip.track && c.id !== clip.id && c.start < d.origStart)
        .sort((a, b) => b.start - a.start)[0];
      if (prev) newStart = Math.max(newStart, prev.start + prev.width);
      let guide: number | null = null;
      if (settings.snapping) {
        const snapped = snapValue(newStart, collectSnapPoints(clip, clips, playheadPx, settings.snapping), zoom);
        if (snapped !== null) { newStart = snapped; guide = snapped; }
      }
      newStart = Math.min(newStart, newEnd - MIN_CLIP_WIDTH);
      setSnapGuide(guide);
      // shift mediaStart forward by the amount we trimmed from the head (video/audio only)
      const trimmedSec = (newStart - d.origStart) / PX_PER_SECOND;
      const patch: Partial<Clip> = { start: newStart, width: newEnd - newStart };
      if (clip.kind === "video" || clip.kind === "audio") {
        patch.mediaStart = Math.max(0, (d.origMediaStart ?? 0) + trimmedSec);
      }
      updateClip(d.id, patch);
      return;
    }
  };

  const onGridPointerUpRef = useRef<(() => void) | null>(null);

  const onGridPointerUp = useCallback(() => {
    seekDragRef.current = false;
    clipDragRef.current = null;
    setSnapGuide(null);
    if (onGridPointerUpRef.current) {
      window.removeEventListener("pointerup", onGridPointerUpRef.current);
      onGridPointerUpRef.current = null;
    }
  }, []);

  const handleTrackDrop = (e: React.DragEvent, trackId: number) => {
    setDragTrack(null);
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const px = Math.max(0, e.clientX - rect.left);
    const startSec = px / pxScale;

    const mediaRaw = e.dataTransfer.getData("application/x-media");
    if (mediaRaw) {
      const targetTrack = tracks.find((t) => t.id === trackId);
      if ((targetTrack as { locked?: boolean })?.locked) {
        toast.error("Cannot add to a locked track");
        return;
      }
      e.preventDefault();
      pushHistory();
      const m = JSON.parse(mediaRaw) as MediaItem;
      const kind: TrackKind = m.kind === "audio" ? "audio" : m.kind === "image" ? "image" : "video";
      let finalTrack = (targetTrack && targetTrack.kind === kind) ? trackId : ensureTrackForKind(kind);
      const seconds = m.duration > 0 ? m.duration : 5;
      const width = Math.max(60, seconds * PX_PER_SECOND);
      let start = Math.max(0, Math.round(startSec * PX_PER_SECOND));

      if (kind === "video") {
        const videoTrack = tracks.find((t) => t.kind === "video");
        if (videoTrack) {
          finalTrack = videoTrack.id;
        }
        start = clips
          .filter((c) => c.track === finalTrack)
          .reduce((acc, c) => Math.max(acc, c.start + c.width), 0);
      } else {
        start = resolveClipPosition(start, width, "__new__", finalTrack, clips);
      }

      if (kind === "audio") {
        addClip({
          kind: "audio", name: m.name, start, width, track: finalTrack,
          src: m.src, mediaKind: "audio",
        });
      } else {
        // Create a real stage element so it's selectable/manipulable on canvas.
        const elId = addElement({
          kind: kind === "video" ? "video" : "image",
          x: 6, y: 6, w: 88, h: 88, rotation: 0,
          color: "#ffffff", src: m.src, opacity: 100, effect: "none", fit: "contain",
        });
        const created = useEditor.getState().clips.find((c) => c.elementId === elId);
        if (created) {
          updateClip(created.id, { start, width, track: finalTrack, name: m.name, thumb: m.thumb ?? m.src });
          void fitElementToMediaAspect(
            elId,
            m.src,
            kind === "video" ? "video" : "image",
            aspect,
            useEditor.getState().updateElement,
          );
        }
      }
      toast.success("Added to timeline");
    }
  };


  return (
    <section className="w-full h-full bg-panel border-t border-border flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <ToolBtn icon={Scissors} label="Split" onClick={() => {
            if (!selectedClipId) return toast.message("Select a clip first");
            const c = clips.find((x) => x.id === selectedClipId);
            if (!c) return;
            if (c.frozen) return toast.message("Element is frozen");
            const cutPx = useEditor.getState().playhead * PX_PER_SECOND;
            if (cutPx <= c.start + 4 || cutPx >= c.start + c.width - 4) {
              return toast.message("Move the playhead inside the clip");
            }
            pushHistory();
            splitClipAtPlayhead(selectedClipId);
          }} />
          <ToolBtn icon={Copy} label="Duplicate" onClick={() => {
            if (!selectedClipId) return;
            const c = clips.find((x) => x.id === selectedClipId);
            if (c?.frozen) return toast.message("Element is frozen");
            pushHistory();
            duplicateClip(selectedClipId);
          }} />
          <ToolBtn icon={Trash2} label="Delete (Del)" onClick={() => {
            if (selectedTransitionId) {
              pushHistory();
              removeTransition(selectedTransitionId);
              return;
            }
            if (!selectedClipId) return;
            const c = clips.find((x) => x.id === selectedClipId);
            if (c?.frozen) return toast.message("Element is frozen");
            pushHistory();
            if (settings.snapping) {
              useEditor.getState().rippleDeleteClip(selectedClipId);
            } else {
              removeClip(selectedClipId);
            }
          }} />
          <ToolBtn icon={Trash} label="Ripple Delete (Alt+Del)" onClick={() => {
            if (!selectedClipId) return;
            const c = clips.find((x) => x.id === selectedClipId);
            if (c?.frozen) return toast.message("Element is frozen");
            pushHistory();
            useEditor.getState().rippleDeleteClip(selectedClipId);
          }} />
          <div className="w-px h-4 bg-border mx-1" />
          <ToolBtn icon={Magnet} label="Snap" active={settings.snapping} onClick={() => setSetting("snapping", !settings.snapping)} />
          <div className="w-px h-4 bg-border mx-1" />
          {(() => {
            const c = selectedClipId ? clips.find((x) => x.id === selectedClipId) : null;
            const frozen = !!c?.frozen;
            return (
              <ToolBtn
                icon={Snowflake}
                label={frozen ? "Unfreeze element" : "Freeze element"}
                active={frozen}
                onClick={() => {
                  if (!c) return toast.message("Select a clip first");
                  pushHistory();
                  updateClip(c.id, { frozen: !frozen });
                  toast.success(frozen ? "Element unfrozen" : "Element frozen");
                }}
              />
            );
          })()}
          {(() => {
            const c = selectedClipId ? clips.find((x) => x.id === selectedClipId) : null;
            const muted = !!c?.audio?.muted;
            return (
              <ToolBtn
                icon={muted ? VolumeX : Volume2}
                label={muted ? "Unmute clip" : "Mute clip"}
                active={muted}
                onClick={() => {
                  if (!c) return toast.message("Select a clip first");
                  pushHistory();
                  updateClip(c.id, { audio: { ...(c.audio ?? {}), muted: !muted } });
                }}
              />
            );
          })()}
          {(() => {
            const c = selectedClipId ? clips.find((x) => x.id === selectedClipId) : null;
            const t = c ? tracks.find((tr) => tr.id === c.track) : null;
            const locked = !!(t as { locked?: boolean } | null)?.locked;
            return (
              <ToolBtn
                icon={locked ? Lock : LockOpen}
                label={locked ? "Unlock track" : "Lock track"}
                active={locked}
                onClick={() => {
                  if (!t) return toast.message("Select a clip first");
                  pushHistory();
                  useEditor.setState((s) => ({
                    tracks: s.tracks.map((x) =>
                      x.id === t.id ? ({ ...x, locked: !locked } as typeof x) : x,
                    ),
                  }));
                }}
              />
            );
          })()}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-zinc-500 tabular-nums">{clips.length} clips · {tracks.length} tracks</span>
          <div className="flex items-center gap-2">
            <Minus className="size-3 text-zinc-500" />
            <Slider value={[zoom * 50]} onValueChange={(v) => setZoom(v[0] / 50)} min={25} max={100} step={1} className="w-28" />
            <Plus className="size-3 text-zinc-500" />
            <span className="text-[10px] font-mono text-zinc-500 w-10 text-right">{Math.round(zoom * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Single scroll container so labels + grid scroll vertically in sync.
          Labels are sticky-left, ruler is sticky-top. */}
      <div className="flex-1 overflow-auto scroll-thin relative">
        <div className="flex min-w-max">
          {/* Track labels column (sticky left) */}
          <div className="w-[140px] shrink-0 border-r border-border bg-panel sticky left-0 z-20">
            {/* Corner spacer that aligns with ruler and stays put */}
            <div className="h-6 border-b border-border bg-panel sticky top-0 z-30" />
            {displayTracks.map((t) => {
              const trackHidden = !!(t as { hidden?: boolean }).hidden;
              const trackMuted = !!(t as { muted?: boolean }).muted;
              const trackLocked = !!(t as { locked?: boolean }).locked;
              const trackVol = (t as { volume?: number }).volume ?? 1;
              const audible = t.kind === "audio" || t.kind === "video";
              return (
                <div key={t.id} className="h-12 px-2 flex items-center justify-between gap-1 border-b border-border/50 group hover:bg-white/[0.02] transition">
                  <div className={`flex items-center gap-1.5 min-w-0 flex-1 transition-opacity duration-250 ${trackLocked ? "opacity-40" : ""}`}>
                    <TrackIcon kind={t.kind} />
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider truncate">{t.label}</span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {audible && (
                      <button
                        title={trackMuted ? "Unmute track" : "Mute track"}
                        onClick={() => {
                          const editor = useEditor.getState();
                          editor.pushHistory();
                          useEditor.setState((s) => ({
                            tracks: s.tracks.map((x) =>
                              x.id === t.id ? ({ ...x, muted: !trackMuted } as typeof x) : x,
                            ),
                          }));
                          editor.markDirty();
                        }}
                        className={`p-1 rounded transition ${trackMuted ? "text-rose-400" : "text-zinc-500 hover:text-zinc-200"}`}
                      >
                        {trackMuted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
                      </button>
                    )}
                    <button
                      title={trackHidden ? "Show track" : "Hide track"}
                      onClick={() => {
                        const editor = useEditor.getState();
                        editor.pushHistory();
                        useEditor.setState((s) => ({
                          tracks: s.tracks.map((x) =>
                            x.id === t.id ? ({ ...x, hidden: !trackHidden } as typeof x) : x,
                          ),
                        }));
                        editor.markDirty();
                      }}
                      className={`p-1 rounded transition ${trackHidden ? "text-amber-400" : "text-zinc-500 hover:text-zinc-200"}`}
                    >
                      <Eye className="size-3" style={trackHidden ? { opacity: 0.4 } : undefined} />
                    </button>
                    <button
                      title={trackLocked ? "Unlock track" : "Lock track"}
                      onClick={() => {
                        const editor = useEditor.getState();
                        editor.pushHistory();
                        useEditor.setState((s) => ({
                          tracks: s.tracks.map((x) =>
                            x.id === t.id ? ({ ...x, locked: !trackLocked } as typeof x) : x,
                          ),
                        }));
                        editor.markDirty();
                      }}
                      className={`p-1 rounded transition ${trackLocked ? "text-amber-500" : "text-zinc-500 hover:text-zinc-200"}`}
                    >
                      {trackLocked ? <Lock className="size-3" /> : <LockOpen className="size-3" style={{ opacity: 0.4 }} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeline grid (right side) */}
          <div
            ref={gridRef}
            className="relative"
            style={{ width: `${Math.max(1400, (Math.max(0, ...clips.map(c => c.start + c.width)) + 400) * zoom)}px`, minWidth: "1400px" }}
            onPointerMove={onGridPointerMove}
          >
            {/* Ruler — sticky to the top of the scroll container */}
            <div
              onPointerDown={onSeekDown}
              className="h-6 border-b border-border flex relative cursor-ew-resize select-none sticky top-0 z-10 bg-panel overflow-hidden"
            >
              {Array.from({ length: Math.ceil(Math.max(1400, (Math.max(0, ...clips.map(c => c.start + c.width)) + 400) * zoom) / pxScale) }).map((_, i) => {
                const timeSec = i;
                const mm = Math.floor(timeSec / 60);
                const ss = Math.floor(timeSec % 60);
                const stepSeconds = Math.ceil(50 / pxScale);
                const showLabel = i % stepSeconds === 0;
                return (
                  <div key={i} className="absolute bottom-0 flex flex-col items-start" style={{ left: i * pxScale }}>
                    <span className={`bg-zinc-600 w-px ${showLabel ? 'h-2' : 'h-1'}`} />
                    {showLabel && (
                      <span className="absolute bottom-2 left-1 text-[8px] font-mono text-zinc-500 whitespace-nowrap">
                        {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Tracks */}
            <div className="timeline-grid relative">
              {displayTracks.map((t) => {
                const trackClips = clips.filter((c) => c.track === t.id).sort((a, b) => a.start - b.start);
                const trackLocked = !!(t as { locked?: boolean }).locked;
                return (
                  <div
                    key={t.id}
                    className={`h-12 border-b border-border/40 relative transition-all duration-200 ${dragTrack === t.id ? "bg-sky-500/10" : ""} ${trackLocked ? "opacity-50 pointer-events-none select-none" : ""}`}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes("application/x-media")) { e.preventDefault(); setDragTrack(t.id); }
                    }}
                    onDragLeave={() => setDragTrack((d) => (d === t.id ? null : d))}
                    onDrop={(e) => handleTrackDrop(e, t.id)}
                  >
                    {trackClips.map((c) => {
                      const selected = c.id === selectedClipId;
                      return (
                        <ClipBlock
                          key={c.id}
                          c={c}
                          selected={selected}
                          zoom={zoom}
                          onPointerDown={(e) => startClipDrag(e, c, "move")}
                          onTrimLeft={(e) => startClipDrag(e, c, "trim-left")}
                          onTrimRight={(e) => startClipDrag(e, c, "trim-right")}
                        />
                      );
                    })}

                    {t.kind === "video" || t.kind === "image"
                      ? trackClips.map((c, idx) => {
                      const boundary = (c.start + c.width) * zoom;
                      const next = trackClips[idx + 1];
                      if (!next) return null;
                      const existing = transitions.find((tr) => tr.track === t.id && Math.abs(tr.start - (c.start + c.width)) < 12 / zoom);
                      return (
                        <TransitionSlot
                          key={`slot-${c.id}`}
                          left={boundary}
                          existing={existing}
                          selected={existing?.id === selectedTransitionId}
                          onSelect={() => existing && selectTransition(existing.id)}
                          onDropTransition={(kind) => {
                            if (existing) return;
                            addTransition({ kind, track: t.id, start: c.start + c.width, duration: 0.6, clipAId: c.id, clipBId: next.id });
                            toast.success("Transition added");
                          }}
                        />
                      );
                    })
                      : null}
                  </div>
                );
              })}
            </div>

            <Playhead />
            {snapGuide !== null && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-40"
                style={{
                  left: snapGuide * zoom,
                  width: 1,
                  background: TIMELINE.snapGuide,
                  boxShadow: `0 0 6px ${TIMELINE.snapGuide}`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------ Clip block (with asset-driven thumbnails) ------------ */

/** Subscribe to the asset record matching a media src for live thumbnail updates. */
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

interface ClipBlockProps {
  c: Clip;
  selected: boolean;
  zoom: number;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onTrimLeft: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onTrimRight: (e: ReactPointerEvent<HTMLSpanElement>) => void;
}

function ClipBlock({ c, selected, zoom, onPointerDown, onTrimLeft, onTrimRight }: ClipBlockProps) {
  const asset = useAssetForSrc(c.src);
  const hasValidThumb = c.thumb && c.thumb !== c.src;
  const thumb =
    asset?.thumbnailUrl ??
    (hasValidThumb ? c.thumb : undefined) ??
    (c.kind === "image" ? c.thumb ?? c.src : undefined);
  const widthPx = Math.max(
    c.kind === "subtitle" ? MIN_SUBTITLE_CLIP_WIDTH : MIN_CLIP_WIDTH,
    c.width * zoom,
  );
  const frameWidth = 60;
  const frames = thumb && widthPx > frameWidth
    ? Math.min(40, Math.ceil(widthPx / frameWidth))
    : 1;

  if (c.kind === "subtitle") {
    const chrome = clipChrome("subtitle");
    return (
      <div
        onPointerDown={onPointerDown}
        title={c.name}
        className={`absolute top-2 h-8 rounded-md overflow-hidden transition-all group ${
          selected
            ? "z-10 shadow-lg"
            : "hover:z-[5] hover:brightness-110"
        }`}
        style={{
          left: c.start * zoom,
          width: widthPx,
          cursor: c.frozen ? "not-allowed" : "grab",
          background: c.frozen ? "linear-gradient(135deg, rgba(14,165,233,0.15), rgba(56,189,248,0.25))" : chrome.bg,
          border: c.frozen ? `1px solid ${selected ? TIMELINE.selectionRing : "rgba(14,165,233,0.6)"}` : `1px solid ${selected ? TIMELINE.selectionRing : chrome.border}`,
          boxShadow: selected ? `inset 0 0 0 1px ${TIMELINE.selectionGlow}` : undefined,
        }}
      >
        <div className="relative h-full flex items-center px-2 pointer-events-none min-w-0">
          {c.frozen && <Snowflake className="w-3 h-3 text-sky-400 mr-1 shrink-0" />}
          <span className="text-[9px] font-medium truncate leading-none" style={{ color: chrome.label }}>
            {c.name}
          </span>
        </div>
        {!c.frozen && (
          <>
            <span
              onPointerDown={onTrimLeft}
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/25 transition"
            />
            <span
              onPointerDown={onTrimRight}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/25 transition"
            />
          </>
        )}
      </div>
    );
  }

  const chrome = clipChrome(c.kind);
  const showFilmstrip = thumb && (c.kind === "video" || c.kind === "image");

  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute top-1.5 h-9 rounded-md overflow-hidden transition-all group ${
        selected ? "z-10 shadow-lg" : "hover:z-[5] hover:brightness-105"
      }`}
      style={{
        left: c.start * zoom,
        width: widthPx,
        cursor: c.frozen ? "not-allowed" : "grab",
        background: c.frozen
          ? "linear-gradient(135deg, rgba(14,165,233,0.25), rgba(56,189,248,0.35))"
          : (c.color && c.kind !== "video" && c.kind !== "image"
            ? `color-mix(in srgb, ${c.color} 35%, ${chrome.bg})`
            : chrome.bg),
        border: c.frozen
          ? `1px solid ${selected ? TIMELINE.selectionRing : "rgba(14,165,233,0.6)"}`
          : `1px solid ${selected ? TIMELINE.selectionRing : chrome.border}`,
        boxShadow: selected ? `inset 0 0 0 1px ${TIMELINE.selectionGlow}` : undefined,
      }}
    >
      {showFilmstrip && (
        <div className="absolute inset-0 flex pointer-events-none" aria-hidden>
          {Array.from({ length: frames }).map((_, i) => (
            <img
              key={i}
              src={thumb || undefined}
              alt=""
              className="h-full object-cover shrink-0 opacity-95"
              style={{ width: `${100 / frames}%` }}
              draggable={false}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/5" />
          {c.frozen && (
            <div className="absolute inset-0 bg-sky-500/10 pointer-events-none" />
          )}
        </div>
      )}
      {c.kind === "audio" && (
        <div className="absolute inset-0 flex items-stretch gap-px px-2 pointer-events-none">
          {Array.from({ length: Math.max(1, Math.floor((c.width * zoom) / 3)) }).map((_, i, arr) => {
            const total = arr.length;
            let amp = 0.5;
            if (c.waveform && c.waveform.length > 0) {
              const idx = Math.floor((i / total) * c.waveform.length);
              amp = c.waveform[Math.min(c.waveform.length - 1, idx)];
            } else {
              const seed = i * 0.42 + (c.start % 97) * 0.13;
              amp =
                0.35 +
                Math.abs(Math.sin(seed)) * 0.35 +
                Math.abs(Math.sin(seed * 2.7)) * 0.2 +
                Math.abs(Math.sin(seed * 6.3)) * 0.1;
            }
            const h = Math.min(0.95, amp);
            return (
              <span key={i} className="relative flex-1 min-w-[2px]">
                <span
                  className="absolute w-[2px] left-1/2 -translate-x-1/2 rounded-full opacity-75"
                  style={{
                    backgroundColor: c.frozen ? "rgb(56, 189, 248)" : chrome.accent,
                    top: `${(1 - h) * 50}%`,
                    bottom: `${(1 - h) * 50}%`,
                  }}
                />
              </span>
            );
          })}
        </div>
      )}
      <div className="relative h-full flex items-center px-2.5 gap-1.5 pointer-events-none min-w-0 z-[1]">
        {c.frozen ? <Snowflake className="w-3 h-3 text-sky-400 shrink-0" /> : <ClipKindIcon kind={c.kind} />}
        <span className="text-[10px] font-semibold truncate drop-shadow-md" style={{ color: chrome.label }}>
          {c.name} {c.playbackRate && c.playbackRate !== 1 ? `(${c.playbackRate}x)` : ""}
        </span>
      </div>
      {!c.frozen && (
        <>
          <span
            onPointerDown={onTrimLeft}
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40 transition"
          />
          <span
            onPointerDown={onTrimRight}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40 transition"
          />
        </>
      )}
    </div>
  );
}

/* ------------ helpers ------------ */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function collectSnapPoints(
  self: Clip,
  clips: Clip[],
  playheadPx?: number,
  snappingEnabled = true,
): number[] {
  if (!snappingEnabled) return [];
  const pts: number[] = [0];
  for (const c of clips) {
    if (c.id === self.id) continue;
    // Subtitle clips snap to playhead and timeline start — not every other subtitle edge.
    if (self.kind === "subtitle" && c.kind === "subtitle") continue;
    pts.push(c.start, c.start + c.width);
  }
  if (typeof playheadPx === "number") pts.push(playheadPx);
  return pts;
}

function snapValue(value: number, points: number[], zoom: number): number | null {
  if (points.length === 0) return null;
  let best: number | null = null;
  const scaledSnap = SNAP_PX / zoom;
  let bestDiff = scaledSnap + 0.01;
  for (const p of points) {
    const d = Math.abs(p - value);
    if (d < bestDiff) { bestDiff = d; best = p; }
  }
  return best;
}

// Pick the valid position nearest to where the user dropped (reduces jumpy drag).
function resolveClipPosition(
  intendedStart: number,
  width: number,
  selfId: string,
  track: number,
  clips: Clip[],
): number {
  let s = Math.max(0, intendedStart);
  const others = clips
    .filter((c) => c.track === track && c.id !== selfId)
    .sort((a, b) => a.start - b.start);

  for (let pass = 0; pass < others.length + 2; pass++) {
    let adjusted = false;
    for (const o of others) {
      const oEnd = o.start + o.width;
      if (s + width <= o.start || s >= oEnd) continue;
      const pushRight = oEnd;
      const pushLeft = Math.max(0, o.start - width);
      const distRight = Math.abs(intendedStart - pushRight);
      const distLeft = Math.abs(intendedStart - pushLeft);
      s = distRight <= distLeft ? pushRight : pushLeft;
      adjusted = true;
    }
    if (!adjusted) break;
  }
  return s;
}

function ClipKindIcon({ kind }: { kind: TrackKind }) {
  const chrome = clipChrome(kind);
  const color = chrome.accent;
  if (kind === "audio") return <Volume2 className="size-3 shrink-0" style={{ color }} />;
  if (kind === "text") return <TypeIcon className="size-3 shrink-0" style={{ color }} />;
  if (kind === "subtitle") return <TypeIcon className="size-3 shrink-0" style={{ color }} />;
  if (kind === "image") return <ImageIcon className="size-3 shrink-0" style={{ color }} />;
  if (kind === "overlay") return <Square className="size-3 shrink-0" style={{ color }} />;
  return <VideoIcon className="size-3 shrink-0" style={{ color }} />;
}

function TransitionSlot({ left, existing, selected, onSelect, onDropTransition }: {
  left: number;
  existing?: { id: string; kind: TransitionId };
  selected: boolean;
  onSelect: () => void;
  onDropTransition: (kind: TransitionId) => void;
}) {
  const [over, setOver] = useState(false);
  const meta = existing ? TRANSITIONS.find((t) => t.id === existing.kind) : null;
  return (
    <div
      className="absolute top-1.5 h-9 -translate-x-1/2 z-20 flex items-center"
      style={{ left }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-transition")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const kind = e.dataTransfer.getData("application/x-transition") as TransitionId;
        if (kind) { e.preventDefault(); onDropTransition(kind); }
      }}
    >
      {existing ? (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          title={meta?.label}
          className={`size-6 grid place-items-center rounded bg-gradient-to-br ${meta?.gradient ?? "from-violet-500 to-fuchsia-600"} ${selected ? "ring-2 ring-white" : "ring-1 ring-white/40"}`}
        >
          <Film className="size-3 text-white" />
        </button>
      ) : (
        <div className={`w-3 h-9 rounded grid place-items-center transition ${over ? "bg-brand/40 ring-1 ring-brand" : "bg-white/5 hover:bg-white/10"}`}>
          <Plus className="size-2.5 text-white/50" />
        </div>
      )}
    </div>
  );
}

function Playhead() {
  const { playhead, zoom } = useEditor();
  const x = playhead * PX_PER_SECOND * zoom;
  return (
    <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: x }}>
      <div
        className="absolute -top-px -left-2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px]"
        style={{ borderTopColor: TIMELINE.playhead }}
      />
      <div className="w-px h-full" style={{ background: TIMELINE.playhead, boxShadow: `0 0 8px ${TIMELINE.playheadGlow}` }} />
    </div>
  );
}

function TrackIcon({ kind }: { kind: TrackKind }) {
  const chrome = clipChrome(kind);
  const color = chrome.accent;
  if (kind === "audio") return <Volume2 className="size-3" style={{ color }} />;
  if (kind === "text") return <TypeIcon className="size-3" style={{ color }} />;
  if (kind === "subtitle") return <TypeIcon className="size-3" style={{ color }} />;
  if (kind === "image") return <ImageIcon className="size-3" style={{ color }} />;
  if (kind === "overlay") return <Square className="size-3" style={{ color }} />;
  return <VideoIcon className="size-3" style={{ color }} />;
}

function ToolBtn({ icon: Icon, label, active, onClick }: { icon: typeof Lock; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger 
          type="button" 
          onClick={onClick} 
          className={`flex items-center justify-center p-1.5 rounded transition ${active ? "bg-brand/15 text-brand-light" : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"}`}
        >
          <Icon className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={5}>
          <p className="text-xs">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
