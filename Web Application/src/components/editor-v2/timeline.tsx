"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import {
  Copy, Magnet, Scissors, Eye, Plus, Minus,
  Volume2, VolumeX, Video as VideoIcon, Type as TypeIcon, Trash2, Trash, Film,
  Image as ImageIcon, Square, Snowflake, Lock, LockOpen,
} from "lucide-react";
import { useEditor, trackWithFreeSpan, type MediaItem, type TransitionId } from "@/lib/editor-v2/editor-store";
import { PX_PER_SECOND, TRANSITIONS, TRACK_LABEL, type Clip, type Track, type TrackKind } from "@/lib/editor-v2/editor-data";
import { fitElementToMediaAspect } from "@/lib/editor-v2/media-stage-fit";
import { TIMELINE, clipChrome } from "@/lib/editor-v2/timeline-theme";
import { sortTracksForDisplay } from "@/lib/editor-v2/layer-priority";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { assetManager, type AssetRecord } from "@/lib/editor-v2/editor/asset-manager";
import { mediaEngine } from "@/lib/editor-v2/editor/media-engine";

const RULER_TICKS = 60;
const MIN_CLIP_WIDTH = 20;
const MIN_SUBTITLE_CLIP_WIDTH = 8;
/** Screen pixels a trim drag must overshoot the source-footage cap before it
 * starts translating the whole clip — absorbs small overshoots so the clip
 * doesn't start moving the instant the drag hits the limit. */
const TRIM_OVERFLOW_MOVE_DEADZONE = 32;
const SNAP_PX = 8;
const ROW_HEIGHT = 48;

/** How a displaced neighbour (and a released clip) eases into its slot. */
const CLIP_SHIFT_MS = 170;
const CLIP_SHIFT_EASING = "cubic-bezier(0.2, 0, 0, 1)";
const CLIP_SHIFT_TRANSITION = `left ${CLIP_SHIFT_MS}ms ${CLIP_SHIFT_EASING}, transform ${CLIP_SHIFT_MS}ms ${CLIP_SHIFT_EASING}, width ${CLIP_SHIFT_MS}ms ${CLIP_SHIFT_EASING}`;
/** Fraction of the smaller clip that must be covered before a neighbour yields
 * its slot. */
const DISPLACE_ENTER_RATIO = 0.5;
/** Screen px of slack on top of that ratio. Swapping is symmetric — the
 * condition to swap back is the mirror of the one to swap forward — so without
 * a deadband the two boundaries meet at exactly the halfway point and a pixel
 * of jitter there would flip the arrangement every frame. */
const DISPLACE_MARGIN_PX = 6;

type DragMode = "move" | "trim-left" | "trim-right";

interface ClipDragState {
  id: string;
  mode: DragMode;
  startX: number;
  startY: number;
  origStart: number;
  origWidth: number;
  origIdx: number; // track row index at drag-start, used to stabilize row math during drag
  origMediaStart?: number;
  moved: boolean;
  /** Row index the pointer is currently over; resolved to a real track at drop. */
  targetIdx: number;
  /** The slot this drag currently owns — where a yielding neighbour goes. It
   * starts as the clip's own position and moves to the neighbour's slot on
   * every swap, so crossing a second clip trades against the *new* arrangement
   * rather than sending everything back to the drag's origin. */
  slotStart: number;
  slotTrack: number;
  /** Drag-time positions of clips this drag has shoved aside. Purely virtual
   * until commit; overrides the store position for both hit-testing and
   * rendering while the gesture is live. */
  layout: Map<string, { start: number; track: number }>;
  /** Other selected same-kind clips (not frozen/locked) to translate alongside the dragged one, keyed by original start px. */
  groupOrigins?: Record<string, number>;
}

/** Where a clip is being shown *during* a drag. Nothing here is committed to
 * the store until pointer-up — writing every pointermove made the component's
 * collision resolver, the store's own overlap resolver and the swap branch all
 * rewrite each other mid-gesture, which is what made dragging feel glitchy. */
interface PreviewItem {
  start: number;
  width: number;
  /** Rows to visually offset by. */
  rowOffset: number;
  /** A neighbour making room, rather than the clip under the pointer: it eases
   * into position instead of tracking the cursor 1:1. */
  displaced?: boolean;
}
interface DragPreview {
  items: Record<string, PreviewItem>;
  guide: number | null;
  /** The drag is hovering the phantom row past the last track — dropping here
   * spawns a new track of the clip's kind. */
  newRow?: boolean;
}

export function Timeline() {
  const {
    playhead, setPlayhead, playing, togglePlay, aspect, clips, selectedClipIds, selectClip, selectClips, zoom, setZoom,
    removeClip, addClip, updateClip, transitions, addTransition, removeTransition,
    selectTransition, selectedTransitionId,
    tracks, ensureTrackForKind, addElement, cleanupEmptyTracks,
    pushHistory, duplicateClip, splitClipAtPlayhead,
    settings, setSetting,
  } = useEditor();
  const gridRef = useRef<HTMLDivElement>(null);
  const tracksGridRef = useRef<HTMLDivElement>(null);
  const seekDragRef = useRef(false);
  const clipDragRef = useRef<ClipDragState | null>(null);
  const marqueeDragRef = useRef<{ x0: number; y0: number; moved: boolean } | null>(null);
  const marqueeRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const lastClickedClipIdRef = useRef<string | null>(null);
  const [dragTrack, setDragTrack] = useState<number | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const previewRef = useRef<DragPreview | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  /** Clips that just landed: they keep a position transition for one beat so
   * they glide from where the pointer left them to their committed slot. */
  const [settlingIds, setSettlingIds] = useState<string[] | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedClipId = selectedClipIds[0] ?? null;

  /** Publish the pending preview at most once per frame — pointermove fires far
   * faster than React can paint, and rendering every event is what made the
   * clip appear to stutter behind the cursor. */
  const flushPreview = useCallback(() => {
    if (previewFrameRef.current != null) return;
    previewFrameRef.current = requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const p = previewRef.current;
      setDragPreview(p ? { items: { ...p.items }, guide: p.guide } : null);
    });
  }, []);

  const clearPreview = useCallback(() => {
    previewRef.current = null;
    if (previewFrameRef.current != null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    setDragPreview(null);
  }, []);

  const beginSettle = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    setSettlingIds(ids);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setSettlingIds(null);
    }, CLIP_SHIFT_MS + 40);
  }, []);

  useEffect(() => () => {
    if (previewFrameRef.current != null) cancelAnimationFrame(previewFrameRef.current);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  useEffect(() => {
    // Keeps track list tidy: 1 empty track per kind, removes extra empty tracks.
    // Skipped mid-drag: a track can be transiently empty between two clip
    // updates in the same drag (e.g. a clip vacating it before being swapped
    // back), and pruning it then would orphan whichever clip lands there next.
    if (clipDragRef.current) return;
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
    clearPreview();
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

    // Shift-click range-selects everything between the last-clicked clip and
    // this one on the same track; ctrl/cmd-click toggles just this one. Both
    // are selection-only — they don't start a move/trim drag.
    if (mode === "move" && e.shiftKey && lastClickedClipIdRef.current) {
      const anchor = clips.find((c) => c.id === lastClickedClipIdRef.current);
      if (anchor && anchor.track === clip.track) {
        const trackClips = clips.filter((c) => c.track === clip.track).sort((a, b) => a.start - b.start);
        const i1 = trackClips.findIndex((c) => c.id === anchor.id);
        const i2 = trackClips.findIndex((c) => c.id === clip.id);
        if (i1 !== -1 && i2 !== -1) {
          const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1];
          selectClips(trackClips.slice(lo, hi + 1).map((c) => c.id));
          return;
        }
      }
    }
    if (mode === "move" && (e.metaKey || e.ctrlKey)) {
      selectClip(clip.id, true);
      lastClickedClipIdRef.current = clip.id;
      return;
    }

    // Dragging a clip that's already part of a multi-selection moves the
    // whole group together — don't collapse the selection down to just this
    // clip (a plain click with no drag still does, via onGridPointerUp).
    const isGroupDrag = mode === "move" && selectedClipIds.length > 1 && selectedClipIds.includes(clip.id);
    lastClickedClipIdRef.current = clip.id;
    if (!isGroupDrag) selectClip(clip.id);
    // History is pushed at commit time, not here: the drag itself no longer
    // mutates the store, so a plain click doesn't need an undo entry.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    let groupOrigins: Record<string, number> | undefined;
    if (isGroupDrag) {
      groupOrigins = {};
      for (const id of selectedClipIds) {
        if (id === clip.id) continue;
        const c = clips.find((x) => x.id === id);
        if (!c || c.kind !== clip.kind || c.frozen) continue;
        const t = tracks.find((tt) => tt.id === c.track);
        if ((t as { locked?: boolean } | undefined)?.locked) continue;
        groupOrigins[id] = c.start;
      }
    }

    clipDragRef.current = {
      id: clip.id, mode,
      startX: e.clientX, startY: e.clientY,
      origStart: clip.start, origWidth: clip.width,
      origIdx: displayTracks.findIndex((t) => t.id === clip.track),
      targetIdx: displayTracks.findIndex((t) => t.id === clip.track),
      origMediaStart: clip.mediaStart,
      moved: false,
      slotStart: clip.start,
      slotTrack: clip.track,
      layout: new Map(),
      groupOrigins,
    };
    if (!onGridPointerUpRef.current) {
      window.addEventListener("pointerup", onGridPointerUp);
    }
    onGridPointerUpRef.current = onGridPointerUp;
  };

  /** Starts a drag-marquee select when the pointer goes down on empty track
   * background (clips/transition slots stopPropagation in their own handlers,
   * so this only ever fires for genuinely empty space). */
  const onTracksBackgroundPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const tracksEl = tracksGridRef.current;
    if (!tracksEl) return;
    const rect = tracksEl.getBoundingClientRect();
    const x0 = e.clientX - rect.left;
    const y0 = e.clientY - rect.top;
    marqueeDragRef.current = { x0, y0, moved: false };
    marqueeRectRef.current = { left: x0, top: y0, width: 0, height: 0 };
    setMarqueeRect(marqueeRectRef.current);
    if (!onGridPointerUpRef.current) {
      window.addEventListener("pointerup", onGridPointerUp);
    }
    onGridPointerUpRef.current = onGridPointerUp;
  };

  const onGridPointerMove = (e: ReactPointerEvent) => {
    if (seekDragRef.current) { seekFromEvent(e); return; }
    const marquee = marqueeDragRef.current;
    const tracksEl = tracksGridRef.current;
    if (marquee && tracksEl) {
      const bounds = tracksEl.getBoundingClientRect();
      const x1 = e.clientX - bounds.left;
      const y1 = e.clientY - bounds.top;
      if (Math.abs(x1 - marquee.x0) + Math.abs(y1 - marquee.y0) > 3) marquee.moved = true;
      const rect = {
        left: Math.min(marquee.x0, x1),
        top: Math.min(marquee.y0, y1),
        width: Math.abs(x1 - marquee.x0),
        height: Math.abs(y1 - marquee.y0),
      };
      marqueeRectRef.current = rect;
      setMarqueeRect(rect);
      return;
    }
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
      const rowDelta = Math.round(dyPx / ROW_HEIGHT);
      // One row past the last track is a valid target: it's the phantom row
      // that spawns a new track at drop. Without it, dragging *down* out of the
      // bottom row (where audio always lives) clamped back onto the same row
      // and there was no way to split a clip onto a new track downwards —
      // dragging up worked only because the row above is another kind.
      d.targetIdx = clamp(d.origIdx + rowDelta, 0, displayTracks.length);

      let intendedStart = Math.max(0, d.origStart + dxPx);
      const points = collectSnapPoints(clip, clips, playheadPx, settings.snapping);
      let guide: number | null = null;
      if (settings.snapping) {
        const startSnap = snapValue(intendedStart, points, zoom);
        const endSnap = snapValue(intendedStart + clip.width, points, zoom);
        if (startSnap !== null) { intendedStart = startSnap; guide = startSnap; }
        else if (endSnap !== null) { intendedStart = endSnap - clip.width; guide = endSnap; }
      }

      // The clip tracks the pointer 1:1 while dragging; the actual store write
      // happens once, at drop.
      const items: Record<string, PreviewItem> = {
        [d.id]: { start: intendedStart, width: clip.width, rowOffset: d.targetIdx - d.origIdx },
      };

      // Cover more than half of a neighbour and it yields: it takes over the
      // slot this drag currently owns, and this drag takes over the slot it
      // vacated. Swaps are sticky and compose, so crossing a second clip trades
      // against where things sit *now*, not where they started. Single drags on
      // an existing same-kind track only (a row of another kind becomes a fresh,
      // empty track at drop, and there's nothing there to displace).
      const targetRow = displayTracks[d.targetIdx];
      const targetTrackId = targetRow && targetRow.kind === clip.kind ? targetRow.id : null;
      if (clip.kind !== "subtitle" && !d.groupOrigins && targetTrackId != null) {
        let best: Clip | null = null;
        let bestOverlap = 0;
        for (const o of clips) {
          if (o.id === clip.id || o.frozen) continue;
          const pos = d.layout.get(o.id) ?? { start: o.start, track: o.track };
          if (pos.track !== targetTrackId) continue;
          if ((tracks.find((t) => t.id === pos.track) as { locked?: boolean } | undefined)?.locked) continue;
          const overlap =
            Math.min(intendedStart + clip.width, pos.start + o.width) - Math.max(intendedStart, pos.start);
          const needed = Math.min(clip.width, o.width) * DISPLACE_ENTER_RATIO + DISPLACE_MARGIN_PX / zoom;
          if (overlap > needed && overlap > bestOverlap) {
            bestOverlap = overlap;
            best = o;
          }
        }
        if (best) {
          const vacated = d.layout.get(best.id) ?? { start: best.start, track: best.track };
          d.layout.set(best.id, { start: d.slotStart, track: d.slotTrack });
          d.slotStart = vacated.start;
          d.slotTrack = vacated.track;
        }
      }

      for (const [id, pos] of d.layout) {
        const o = clips.find((c) => c.id === id);
        if (!o) continue;
        items[id] = {
          start: pos.start,
          width: o.width,
          // The element lives in its *stored* track's row, so shifting rows is
          // a transform relative to that row.
          rowOffset:
            displayTracks.findIndex((t) => t.id === pos.track) -
            displayTracks.findIndex((t) => t.id === o.track),
          displaced: true,
        };
      }

      if (d.groupOrigins) {
        // Carry the rest of the selection by the same (snapped) delta so the
        // group keeps its internal spacing.
        const effectiveDx = intendedStart - d.origStart;
        for (const [gid, gOrigStart] of Object.entries(d.groupOrigins)) {
          const gClip = clips.find((c) => c.id === gid);
          if (!gClip) continue;
          items[gid] = { start: Math.max(0, gOrigStart + effectiveDx), width: gClip.width, rowOffset: 0 };
        }
      }
      previewRef.current = { items, guide, newRow: d.targetIdx >= displayTracks.length };
      flushPreview();
      return;
    }

    if (d.mode === "trim-right") {
      const next = clips
        .filter((c) => c.track === clip.track && c.id !== clip.id && c.start >= d.origStart)
        .sort((a, b) => a.start - b.start)[0];
      const collisionCap = next ? next.start - d.origStart : Infinity;
      // Never extend a video/audio clip past the end of its source media —
      // there's no extra footage to reveal, so cap at what's left after mediaStart.
      const hasSourceCap = (clip.kind === "video" || clip.kind === "audio") && typeof clip.sourceDuration === "number";
      const sourceCap = hasSourceCap
        ? Math.max(MIN_CLIP_WIDTH, (clip.sourceDuration! - (clip.mediaStart ?? 0)) * PX_PER_SECOND)
        : Infinity;
      const widthCap = Math.min(collisionCap, sourceCap);
      const rawWidth = Math.max(MIN_CLIP_WIDTH, d.origWidth + dxPx);

      let newStart = d.origStart;
      let newWidth = Math.min(rawWidth, widthCap);
      let guide: number | null = null;

      if (rawWidth > widthCap && hasSourceCap && sourceCap <= collisionCap) {
        // Already stretched to the end of the source footage — there's nothing
        // more to reveal. A small overshoot is absorbed (so it doesn't feel
        // like the clip is being yanked around); only a deliberate, sustained
        // drag past that dead zone starts sliding the whole clip forward
        // (stops at the next clip).
        const overflow = rawWidth - widthCap - TRIM_OVERFLOW_MOVE_DEADZONE / zoom;
        if (overflow > 0) {
          const maxStart = next ? next.start - newWidth : Infinity;
          newStart = Math.min(d.origStart + overflow, maxStart);
        }
      } else if (settings.snapping) {
        const targetEnd = d.origStart + newWidth;
        const snapped = snapValue(targetEnd, collectSnapPoints(clip, clips, playheadPx, settings.snapping), zoom);
        if (snapped !== null) { newWidth = snapped - d.origStart; guide = snapped; }
      }

      previewRef.current = {
        items: { [d.id]: { start: newStart, width: Math.max(MIN_CLIP_WIDTH, newWidth), rowOffset: 0 } },
        guide,
      };
      flushPreview();
      return;
    }

    if (d.mode === "trim-left") {
      const newEnd = d.origStart + d.origWidth;
      const prev = [...clips]
        .filter((c) => c.track === clip.track && c.id !== clip.id && c.start < d.origStart)
        .sort((a, b) => b.start - a.start)[0];
      const prevCap = prev ? prev.start + prev.width : 0;
      // Never reveal earlier than the source media actually starts (mediaStart can't go below 0).
      const hasSourceCap = (clip.kind === "video" || clip.kind === "audio") && typeof clip.sourceDuration === "number";
      const sourceCap = hasSourceCap ? d.origStart - (d.origMediaStart ?? 0) * PX_PER_SECOND : -Infinity;
      const minAllowed = Math.max(prevCap, 0, sourceCap);
      const rawStart = d.origStart + dxPx;

      if (rawStart < minAllowed && hasSourceCap && sourceCap >= prevCap) {
        // Already stretched to the start of the source footage — there's
        // nothing earlier to reveal. A small overshoot is absorbed; only a
        // deliberate, sustained drag past that dead zone slides the whole
        // clip backward (stops at the previous clip). mediaStart is already
        // pinned at 0 by the time this kicks in, and translating doesn't change it.
        const overflow = minAllowed - rawStart - TRIM_OVERFLOW_MOVE_DEADZONE / zoom;
        const newStart = overflow > 0
          ? minAllowed - Math.min(overflow, minAllowed - prevCap)
          : minAllowed;
        previewRef.current = {
          items: { [d.id]: { start: newStart, width: newEnd - newStart, rowOffset: 0 } },
          guide: null,
        };
        flushPreview();
        return;
      }

      let newStart = Math.max(rawStart, minAllowed);
      let guide: number | null = null;
      if (settings.snapping) {
        const snapped = snapValue(newStart, collectSnapPoints(clip, clips, playheadPx, settings.snapping), zoom);
        if (snapped !== null) { newStart = snapped; guide = snapped; }
      }
      newStart = Math.min(newStart, newEnd - MIN_CLIP_WIDTH);
      previewRef.current = {
        items: { [d.id]: { start: newStart, width: newEnd - newStart, rowOffset: 0 } },
        guide,
      };
      flushPreview();
      return;
    }
  };

  const onGridPointerUpRef = useRef<(() => void) | null>(null);

  const onGridPointerUp = useCallback(() => {
    seekDragRef.current = false;
    const clipDrag = clipDragRef.current;
    const wasDraggingClip = clipDrag != null;
    if (clipDrag && !clipDrag.moved && clipDrag.groupOrigins) {
      // Plain click (no drag) on a clip inside a multi-selection: collapse
      // to just this clip. A real drag, by contrast, keeps the group intact
      // so the whole selection has already moved together above.
      useEditor.getState().selectClip(clipDrag.id);
    }
    if (clipDrag && clipDrag.moved) {
      beginSettle(commitClipDrag(clipDrag, previewRef.current));
    }
    clipDragRef.current = null;
    clearPreview();
    if (wasDraggingClip) {
      // The drag-guard on the cleanup effect skipped it while this clip was
      // moving; run it once now that the track set has settled.
      useEditor.getState().cleanupEmptyTracks();
    }

    const marquee = marqueeDragRef.current;
    if (marquee) {
      marqueeDragRef.current = null;
      const rect = marqueeRectRef.current;
      marqueeRectRef.current = null;
      setMarqueeRect(null);
      const state = useEditor.getState();
      if (rect && marquee.moved) {
        const zoomNow = state.zoom;
        const displayTracksNow = sortTracksForDisplay(state.tracks);
        const firstRow = Math.floor(rect.top / ROW_HEIGHT);
        const lastRow = Math.floor((rect.top + rect.height - 1) / ROW_HEIGHT);
        const ids: string[] = [];
        displayTracksNow.forEach((t, idx) => {
          if (idx < firstRow || idx > lastRow) return;
          for (const c of state.clips.filter((cl) => cl.track === t.id)) {
            const cLeft = c.start * zoomNow;
            const cRight = (c.start + c.width) * zoomNow;
            if (cRight >= rect.left && cLeft <= rect.left + rect.width) ids.push(c.id);
          }
        });
        state.selectClips(ids);
      } else {
        // A plain click on empty background (no real drag): clear selection.
        state.selectClip(null);
      }
    }

    if (onGridPointerUpRef.current) {
      window.removeEventListener("pointerup", onGridPointerUpRef.current);
      onGridPointerUpRef.current = null;
    }
  }, [clearPreview, beginSettle]);

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
      } else if (kind === "audio") {
        // The drop x is where the user wants the audio, so honour it: if the
        // row under the cursor is already busy there, stack it on another free
        // audio track (creating one if needed) rather than sliding it right.
        const busy = clips.some(
          (c) => c.track === finalTrack && start < c.start + c.width && start + width > c.start,
        );
        if (busy) {
          finalTrack =
            trackWithFreeSpan(tracks, clips, "audio", start, width) ??
            useEditor.getState().addTrack("audio");
        }
      } else {
        start = resolveClipPosition(start, width, "__new__", finalTrack, clips);
      }

      if (kind === "audio") {
        addClip({
          kind: "audio", name: m.name, start, width, track: finalTrack,
          src: m.src, mediaKind: "audio", mediaAssetId: m.mediaAssetId, sourceDuration: m.duration,
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
          updateClip(created.id, { start, width, track: finalTrack, name: m.name, thumb: m.thumb ?? m.src, mediaAssetId: m.mediaAssetId, sourceDuration: m.duration });
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
            if (selectedClipIds.length === 0) return toast.message("Select a clip first");
            const cutPx = useEditor.getState().playhead * PX_PER_SECOND;
            const targets = selectedClipIds.filter((id) => {
              const c = clips.find((x) => x.id === id);
              return c && !c.frozen && cutPx > c.start + 4 && cutPx < c.start + c.width - 4;
            });
            if (targets.length === 0) return toast.message("Move the playhead inside the clip");
            pushHistory();
            targets.forEach((id) => splitClipAtPlayhead(id));
          }} />
          <ToolBtn icon={Copy} label="Duplicate" onClick={() => {
            if (selectedClipIds.length === 0) return;
            const targets = selectedClipIds.filter((id) => !clips.find((x) => x.id === id)?.frozen);
            if (targets.length === 0) return toast.message("Element is frozen");
            pushHistory();
            targets.forEach((id) => duplicateClip(id));
          }} />
          <ToolBtn icon={Trash2} label="Delete (Del)" onClick={() => {
            if (selectedTransitionId) {
              pushHistory();
              removeTransition(selectedTransitionId);
              return;
            }
            if (selectedClipIds.length === 0) return;
            const targets = selectedClipIds.filter((id) => !clips.find((x) => x.id === id)?.frozen);
            if (targets.length === 0) return toast.message("Element is frozen");
            pushHistory();
            targets.forEach((id) => {
              if (settings.snapping) useEditor.getState().rippleDeleteClip(id);
              else removeClip(id);
            });
          }} />
          <ToolBtn icon={Trash} label="Ripple Delete (Alt+Del)" onClick={() => {
            if (selectedClipIds.length === 0) return;
            const targets = selectedClipIds.filter((id) => !clips.find((x) => x.id === id)?.frozen);
            if (targets.length === 0) return toast.message("Element is frozen");
            pushHistory();
            targets.forEach((id) => useEditor.getState().rippleDeleteClip(id));
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
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider truncate">{trackDisplayLabel(t, tracks)}</span>
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
            <div
              ref={tracksGridRef}
              className="timeline-grid relative"
              onPointerDown={onTracksBackgroundPointerDown}
            >
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
                      const selected = selectedClipIds.includes(c.id);
                      return (
                        <ClipBlock
                          key={c.id}
                          c={c}
                          selected={selected}
                          zoom={zoom}
                          preview={dragPreview?.items[c.id]}
                          settling={settlingIds?.includes(c.id) ?? false}
                          onPointerDown={(e) => startClipDrag(e, c, "move")}
                          onTrimLeft={(e) => startClipDrag(e, c, "trim-left")}
                          onTrimRight={(e) => startClipDrag(e, c, "trim-right")}
                        />
                      );
                    })}

                    {trackClips.map((c, idx) => {
                      const next = trackClips[idx + 1];
                      if (!next) return null;
                      // No transition between clips that have a gap — a
                      // transition only makes sense across a shared boundary.
                      // (A negative difference means they already overlap,
                      // which is exactly what an applied transition looks like.)
                      if (next.start - (c.start + c.width) > 0.5) return null;
                      // Match on the clip pair, not on a pixel position: once a
                      // transition is applied the clips overlap, so its anchor
                      // no longer sits on the old cut position and a positional
                      // match silently found nothing — letting you stack a
                      // second transition on the same pair.
                      const existing = transitions.find(
                        (tr) => tr.track === t.id && tr.clipAId === c.id && tr.clipBId === next.id,
                      );
                      // Centre the badge on the overlap it represents.
                      const overlapStart = existing ? next.start : c.start + c.width;
                      const boundary = ((overlapStart + (c.start + c.width)) / 2) * zoom;
                      return (
                        <TransitionSlot
                          key={`slot-${c.id}`}
                          left={boundary}
                          existing={existing}
                          selected={existing?.id === selectedTransitionId}
                          onSelect={() => existing && selectTransition(existing.id)}
                          onDropTransition={(kind) => {
                            if (existing) return;
                            const id = addTransition({ kind, track: t.id, start: c.start + c.width, duration: 0.6, clipAId: c.id, clipBId: next.id });
                            if (!id) {
                              toast.message("These clips are too short for a transition");
                              return;
                            }
                            toast.success("Transition added");
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}

              {/* Phantom row: dropping here splits the clip onto a brand-new
                  track. Also gives the dragged clip somewhere to render while
                  it hovers past the last track. */}
              {dragPreview?.newRow && (
                <div className="h-12 border border-dashed border-sky-500/50 bg-sky-500/5 rounded-sm flex items-center pl-2 pointer-events-none">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400/80">
                    New track
                  </span>
                </div>
              )}

              {marqueeRect && (
                <div
                  className="absolute pointer-events-none z-30 rounded-sm"
                  style={{
                    left: marqueeRect.left,
                    top: marqueeRect.top,
                    width: marqueeRect.width,
                    height: marqueeRect.height,
                    background: "rgba(129, 140, 248, 0.15)",
                    border: "1px solid rgba(129, 140, 248, 0.8)",
                  }}
                />
              )}
            </div>

            <Playhead />
            {dragPreview?.guide != null && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-40"
                style={{
                  left: dragPreview.guide * zoom,
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

/**
 * Subscribe to the asset record matching a media src for live thumbnail updates.
 *
 * Also registers the src with the Media Engine on first sight. Only uploads
 * used to register, so clips restored from a saved project had no AssetRecord
 * and therefore never got a filmstrip.
 */
function useAssetForSrc(c: Clip): AssetRecord | null {
  const src = c.src;
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
  useEffect(() => {
    if (!src) return;
    if (c.kind !== "video" && c.kind !== "image") return;
    mediaEngine.ensureRegistered({
      name: c.name || "clip",
      kind: c.kind,
      originalUrl: src,
    });
  }, [src, c.kind, c.name]);
  return rec;
}

interface ClipBlockProps {
  c: Clip;
  selected: boolean;
  zoom: number;
  /** Set while this clip is being dragged/trimmed, or is making room for the
   * clip that is — geometry to render instead of the (untouched) store values. */
  preview?: PreviewItem;
  /** Just committed: keep the position transition on for one beat so it glides
   * from where the drag left it to its stored slot. */
  settling?: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onTrimLeft: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onTrimRight: (e: ReactPointerEvent<HTMLSpanElement>) => void;
}

function ClipBlock({ c, selected, zoom, preview, settling, onPointerDown, onTrimLeft, onTrimRight }: ClipBlockProps) {
  const asset = useAssetForSrc(c);
  const hasValidThumb = c.thumb && c.thumb !== c.src;
  const thumb =
    asset?.thumbnailUrl ??
    (hasValidThumb ? c.thumb : undefined) ??
    (c.kind === "image" ? c.thumb ?? c.src : undefined);
  const leftPx = (preview?.start ?? c.start) * zoom;
  const widthPx = Math.max(
    c.kind === "subtitle" ? MIN_SUBTITLE_CLIP_WIDTH : MIN_CLIP_WIDTH,
    (preview?.width ?? c.width) * zoom,
  );
  // The clip under the pointer follows it exactly — easing left/width here
  // reads as the clip lagging behind and stuttering. A neighbour making room
  // is the opposite: it should visibly glide into the vacated slot. Both shift
  // rows with a transform rather than re-parenting into another track's row.
  const rowShift = preview?.rowOffset ? `translateY(${preview.rowOffset * ROW_HEIGHT}px)` : undefined;
  const dragStyle: React.CSSProperties = preview
    ? preview.displaced
      ? { transition: CLIP_SHIFT_TRANSITION, transform: rowShift }
      : { transition: "none", transform: rowShift, zIndex: 40, opacity: 0.9, cursor: "grabbing" }
    : settling
      ? { transition: CLIP_SHIFT_TRANSITION }
      : {};
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
        className={`absolute top-2 h-8 rounded-md overflow-hidden transition-[filter,box-shadow,border-color] duration-150 group ${
          selected
            ? "z-10 shadow-lg"
            : "hover:z-[5] hover:brightness-110"
        }`}
        style={{
          left: leftPx,
          width: widthPx,
          cursor: c.frozen ? "not-allowed" : "grab",
          background: c.frozen ? "linear-gradient(135deg, rgba(14,165,233,0.15), rgba(56,189,248,0.25))" : chrome.bg,
          border: c.frozen ? `1px solid ${selected ? TIMELINE.selectionRing : "rgba(14,165,233,0.6)"}` : `${selected ? "2px" : "1px"} solid ${selected ? TIMELINE.selectionRing : chrome.border}`,
          boxShadow: selected ? `0 0 0 1px ${TIMELINE.selectionRing}, 0 0 10px ${TIMELINE.selectionGlow}` : undefined,
          ...dragStyle,
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
  const videoFallbackSrc = c.kind === "video" && c.src && !c.src.startsWith("blob:") ? `${c.src}#t=0.1` : null;
  const showFilmstrip = (c.kind === "video" || c.kind === "image") && (thumb || videoFallbackSrc);

  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute top-1.5 h-9 rounded-md overflow-hidden transition-[filter,box-shadow,border-color] duration-150 group ${
        selected ? "z-10 shadow-lg" : "hover:z-[5] hover:brightness-105"
      }`}
      style={{
        left: leftPx,
        width: widthPx,
        cursor: c.frozen ? "not-allowed" : "grab",
        background: c.frozen
          ? "linear-gradient(135deg, rgba(14,165,233,0.25), rgba(56,189,248,0.35))"
          : (c.color && c.kind !== "video" && c.kind !== "image"
            ? `color-mix(in srgb, ${c.color} 35%, ${chrome.bg})`
            : chrome.bg),
        border: c.frozen
          ? `1px solid ${selected ? TIMELINE.selectionRing : "rgba(14,165,233,0.6)"}`
          : `${selected ? "2px" : "1px"} solid ${selected ? TIMELINE.selectionRing : chrome.border}`,
        boxShadow: selected ? `0 0 0 1px ${TIMELINE.selectionRing}, 0 0 10px ${TIMELINE.selectionGlow}` : undefined,
        ...dragStyle,
      }}
    >
      {showFilmstrip && (
        <div className="absolute inset-0 flex pointer-events-none" aria-hidden>
          {Array.from({ length: frames }).map((_, i) => (
            thumb ? (
              <img
                key={i}
                src={thumb}
                alt=""
                className="h-full object-cover shrink-0 opacity-95"
                style={{ width: `${100 / frames}%` }}
                draggable={false}
              />
            ) : videoFallbackSrc ? (
              <video
                key={i}
                src={videoFallbackSrc}
                className="h-full object-cover shrink-0 opacity-95"
                style={{ width: `${100 / frames}%` }}
                muted
                playsInline
                preload="metadata"
              />
            ) : null
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/5" />
          {c.frozen && (
            <div className="absolute inset-0 bg-sky-500/10 pointer-events-none" />
          )}
        </div>
      )}
      {c.kind === "audio" && (
        <div className="absolute inset-0 flex items-center gap-[3px] px-2 pointer-events-none">
          {Array.from({ length: Math.max(1, Math.floor((c.width * zoom) / 4)) }).map((_, i, arr) => {
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
            const h = Math.max(0.08, Math.min(0.62, amp * 0.62));
            return (
              <span key={i} className="relative flex-1 min-w-[1.5px] self-stretch">
                <span
                  className="absolute w-[1.5px] left-1/2 -translate-x-1/2 rounded-full opacity-45"
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
      {c.kind === "audio" && (
        <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
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

/**
 * Writes the result of a drag to the store — once, on release.
 *
 * Everything order-dependent (track creation, swapping, overlap resolution)
 * happens here against a single fresh snapshot, so it can't fight a half-
 * applied state from an earlier pointermove.
 *
 * Returns the clips that moved, so the caller can let them ease into place.
 */
function commitClipDrag(d: ClipDragState, preview: DragPreview | null): string[] {
  const pv = preview?.items[d.id];
  if (!pv) return [];
  const state = useEditor.getState();
  const clip = state.clips.find((c) => c.id === d.id);
  if (!clip) return [];

  state.pushHistory();

  if (d.mode !== "move") {
    const patch: Partial<Clip> = { start: pv.start, width: pv.width };
    if (clip.kind === "video" || clip.kind === "audio") {
      if (d.mode === "trim-left") {
        // Head trim reveals/hides source footage: shift mediaStart by however
        // much the head actually moved.
        patch.mediaStart = Math.max(0, (d.origMediaStart ?? 0) + (pv.start - d.origStart) / PX_PER_SECOND);
      }
    }
    state.updateClip(d.id, patch);
    return [d.id];
  }

  // Resolve the row the pointer ended on to a real track. A new track is
  // created when the clip was dropped on a row of a different kind, or on the
  // phantom row past the last track (the "drag below to split off" gesture).
  const displayNow = sortTracksForDisplay(state.tracks);
  let targetTrackId = clip.track;
  if (d.targetIdx >= displayNow.length) {
    targetTrackId = state.addTrack(clip.kind);
  } else {
    const targetRow = displayNow[clamp(d.targetIdx, 0, displayNow.length - 1)];
    if (targetRow) {
      if (targetRow.kind === clip.kind) targetTrackId = targetRow.id;
      else if (targetRow.id !== clip.track) targetTrackId = state.addTrack(clip.kind);
    }
  }

  // Neighbours keep the slots they animated into — the new arrangement is
  // already on screen, so committing anything else would snap clips somewhere
  // the user never saw. The dragged clip is then placed against that
  // arrangement, which drops it into the slot it opened up when it's hovering
  // one, and leaves it under the pointer when it isn't (dragged out past
  // everything, say).
  const arranged = state.clips.map((c) => {
    const pos = d.layout.get(c.id);
    return pos ? { ...c, start: pos.start, track: pos.track } : c;
  });
  const finalStart = clip.kind === "subtitle"
    ? pv.start
    : resolveClipPosition(pv.start, clip.width, clip.id, targetTrackId, arranged);

  // One atomic update: routing these through updateClip would run each against
  // a state where another clip still occupies the slot, and the store's overlap
  // resolver would fling it elsewhere.
  useEditor.setState((s) => ({
    clips: s.clips.map((c) => {
      if (c.id === clip.id) return { ...c, start: finalStart, track: targetTrackId };
      const pos = d.layout.get(c.id);
      return pos ? { ...c, start: pos.start, track: pos.track } : c;
    }),
  }));
  useEditor.getState().markDirty();
  const settled = [clip.id, ...d.layout.keys()];

  if (d.groupOrigins) {
    for (const gid of Object.keys(d.groupOrigins)) {
      const gPv = preview!.items[gid];
      const gClip = useEditor.getState().clips.find((c) => c.id === gid);
      if (!gPv || !gClip) continue;
      const gStart = gClip.kind === "subtitle"
        ? gPv.start
        : resolveClipPosition(gPv.start, gClip.width, gid, gClip.track, useEditor.getState().clips);
      useEditor.getState().updateClip(gid, { start: gStart });
      settled.push(gid);
    }
  }
  return settled;
}

/** Always derive the label from the track's own kind rather than trusting a
 * persisted `label`/`name` string — several legacy save paths have written
 * stale or mismatched labels (e.g. a text/title track saved as "Subtitles"),
 * and tracks have no rename UI, so the kind is the only source of truth. */
function trackDisplayLabel(t: Track, all: Track[]): string {
  const sameKind = all.filter((x) => x.kind === t.kind).sort((a, b) => a.id - b.id);
  const idx = sameKind.findIndex((x) => x.id === t.id);
  const base = TRACK_LABEL[t.kind];
  return sameKind.length > 1 ? `${base} ${idx + 1}` : base;
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
        <div className={`w-3 h-9 rounded transition ${over ? "bg-brand/40 ring-1 ring-brand" : "bg-transparent hover:bg-white/10"}`} />
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
