/**
 * Phase 2 — Timeline UI state.
 *
 * Holds state that is "view-only" and never touches the time-based ProjectSec:
 *   - multi-selection set
 *   - markers (UI-side, not exported as part of the project model in V2)
 *   - clipboard
 *   - zoom + scroll + viewport width
 *   - snap config + last snap guide
 *   - command counters & timings (telemetry for the Debug HUD)
 *
 * Markers are kept here intentionally so the integrity engine doesn't have
 * to learn about them in V2 — they will move into ProjectSec in a later phase.
 */

import { create } from "zustand";
import type { ClipboardPayload } from "./timeline-engine";

export type ZoomLevel = 0.1 | 0.25 | 0.5 | 1 | 2 | 5 | 10;
export const ZOOM_LEVELS: ZoomLevel[] = [0.1, 0.25, 0.5, 1, 2, 5, 10];
/** Base pixels-per-second at zoom = 1. */
export const BASE_PX_PER_SEC = 100;

export interface Marker {
  id: string;
  name: string;
  time: number;
  color: string;
}

export interface SnapConfig {
  enabled: boolean;
  /** snap threshold in px (default 10). */
  thresholdPx: number;
}

export interface SnapGuide {
  /** Absolute time the guide is drawn at. */
  time: number;
  /** Source of the snap. */
  source: "playhead" | "clip-start" | "clip-end" | "marker";
  /** ID of the snapped element when applicable. */
  refId?: string;
}

export interface CommandCounts {
  move: number;
  trim: number;
  split: number;
  delete: number;
  undo: number;
  redo: number;
  paste: number;
  duplicate: number;
}

export interface CommandTiming {
  /** Cumulative ms across all recorded commands. */
  totalMs: number;
  /** Number of timed samples. */
  samples: number;
  /** Max observed ms for a single command. */
  maxMs: number;
  /** Last command type recorded. */
  lastType: string;
}

interface UIState {
  /* selection */
  selectedClipIds: Set<string>;
  selectionAnchor: string | null;

  /* markers */
  markers: Marker[];

  /* clipboard */
  clipboard: ClipboardPayload | null;

  /* viewport */
  zoom: ZoomLevel;
  scrollX: number;
  viewportWidth: number;

  /* snap */
  snap: SnapConfig;
  lastGuide: SnapGuide | null;

  /* telemetry */
  counts: CommandCounts;
  timing: CommandTiming;

  /* selection actions */
  selectOnly: (id: string) => void;
  toggleSelected: (id: string) => void;
  selectRange: (ids: string[]) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  setAnchor: (id: string | null) => void;

  /* markers */
  addMarker: (m: Omit<Marker, "id">) => string;
  removeMarker: (id: string) => void;
  updateMarker: (id: string, patch: Partial<Omit<Marker, "id">>) => void;

  /* clipboard */
  setClipboard: (c: ClipboardPayload | null) => void;

  /* viewport */
  setZoom: (z: ZoomLevel) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollX: (x: number) => void;
  setViewportWidth: (w: number) => void;

  /* snap */
  setSnapEnabled: (on: boolean) => void;
  setSnapThreshold: (px: number) => void;
  setLastGuide: (g: SnapGuide | null) => void;

  /* telemetry */
  recordCommand: (type: string, ms: number) => void;
  resetCounts: () => void;
}

const uid = (p = "id") =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const emptyCounts = (): CommandCounts => ({
  move: 0,
  trim: 0,
  split: 0,
  delete: 0,
  undo: 0,
  redo: 0,
  paste: 0,
  duplicate: 0,
});

const emptyTiming = (): CommandTiming => ({
  totalMs: 0,
  samples: 0,
  maxMs: 0,
  lastType: "",
});

function bump(counts: CommandCounts, type: string): CommandCounts {
  const k: Record<string, keyof CommandCounts> = {
    Move: "move",
    MoveClip: "move",
    Trim: "trim",
    TrimClip: "trim",
    Split: "split",
    SplitClip: "split",
    Delete: "delete",
    RemoveClip: "delete",
    Undo: "undo",
    Redo: "redo",
    Paste: "paste",
    Duplicate: "duplicate",
  };
  const key = k[type];
  if (!key) return counts;
  return { ...counts, [key]: counts[key] + 1 };
}

export const useTimelineUI = create<UIState>((set, get) => ({
  selectedClipIds: new Set<string>(),
  selectionAnchor: null,
  markers: [],
  clipboard: null,
  zoom: 1,
  scrollX: 0,
  viewportWidth: 1200,
  snap: { enabled: true, thresholdPx: 10 },
  lastGuide: null,
  counts: emptyCounts(),
  timing: emptyTiming(),

  selectOnly: (id) => set({ selectedClipIds: new Set([id]), selectionAnchor: id }),
  toggleSelected: (id) => {
    const s = new Set(get().selectedClipIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    set({ selectedClipIds: s, selectionAnchor: id });
  },
  selectRange: (ids) => set({ selectedClipIds: new Set(ids) }),
  setSelection: (ids) => set({ selectedClipIds: new Set(ids) }),
  clearSelection: () => set({ selectedClipIds: new Set(), selectionAnchor: null }),
  setAnchor: (id) => set({ selectionAnchor: id }),

  addMarker: (m) => {
    const id = uid("mk");
    set((s) => ({ markers: [...s.markers, { id, ...m }].sort((a, b) => a.time - b.time) }));
    return id;
  },
  removeMarker: (id) => set((s) => ({ markers: s.markers.filter((m) => m.id !== id) })),
  updateMarker: (id, patch) =>
    set((s) => ({
      markers: s.markers
        .map((m) => (m.id === id ? { ...m, ...patch } : m))
        .sort((a, b) => a.time - b.time),
    })),

  setClipboard: (c) => set({ clipboard: c }),

  setZoom: (z) => set({ zoom: z }),
  zoomIn: () => {
    const cur = get().zoom;
    const i = ZOOM_LEVELS.indexOf(cur);
    set({ zoom: ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, i + 1)] });
  },
  zoomOut: () => {
    const cur = get().zoom;
    const i = ZOOM_LEVELS.indexOf(cur);
    set({ zoom: ZOOM_LEVELS[Math.max(0, i - 1)] });
  },
  setScrollX: (x) => set({ scrollX: Math.max(0, x) }),
  setViewportWidth: (w) => set({ viewportWidth: Math.max(0, w) }),

  setSnapEnabled: (on) => set((s) => ({ snap: { ...s.snap, enabled: on } })),
  setSnapThreshold: (px) => set((s) => ({ snap: { ...s.snap, thresholdPx: Math.max(0, px) } })),
  setLastGuide: (g) => set({ lastGuide: g }),

  recordCommand: (type, ms) => {
    set((s) => ({
      counts: bump(s.counts, type),
      timing: {
        totalMs: s.timing.totalMs + ms,
        samples: s.timing.samples + 1,
        maxMs: Math.max(s.timing.maxMs, ms),
        lastType: type,
      },
    }));
  },
  resetCounts: () => set({ counts: emptyCounts(), timing: emptyTiming() }),
}));

export const pxPerSecond = (zoom: ZoomLevel) => BASE_PX_PER_SEC * zoom;
