import { create } from "zustand";
import {
  INITIAL_CLIPS,
  INITIAL_TRACKS,
  TRACK_LABEL,
  type Clip,
  type ClipKind,
  type Track,
  type TrackKind,
  type ToolId,
  type AspectId,
  PX_PER_SECOND,
} from "./editor-data";
import { fitElementToMediaAspect } from "./media-stage-fit";
import { mapSubtitleStyleToStage, mapTitleStyleToStage, stripFactCategoryPrefix } from "@/lib/subtitles/presets";
import type { SubtitleStyle } from "@/lib/subtitles/types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type StageElementKind =
  | "text"
  | "rect"
  | "ellipse"
  | "triangle"
  | "image"
  | "video"
  | "sticker"
  | "shape";

export interface StageElement {
  id: string;
  kind: StageElementKind;
  // position & size as percentages of the stage (0-100)
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  text?: string;
  color: string;
  fontSize?: number; // px relative to a 1080-tall stage
  fontWeight?: number;
  fontFamily?: string;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  opacity?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
  stroke?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  shadow?: boolean;
  highlightColor?: string;
  animation?: string;
  /** When set, canvas uses Subtitles-tab inset overlay instead of % bounding box. */
  studioOverlay?: "subtitle" | "title";
  src?: string; // image/video element source
  fit?: "cover" | "contain";
  effect?: EffectId | null;
  // for stickers
  emoji?: string;
  shapeType?: string; // e.g. "cloud", "line", "star", "heart", "arrow", "pentagon", "hexagon", "bubble"
  source?: "ai" | "user";
  words?: any[];
}

export type MediaKind = "video" | "image" | "audio";
export interface MediaItem {
  id: string;
  mediaAssetId?: string;
  name: string;
  kind: MediaKind;
  src: string; // object URL or remote URL
  duration: number; // seconds (0 for image)
  size: number; // bytes (used for dedup)
  thumb?: string;
  waveform?: number[];
}

export type EffectId =
  | "none"
  | "grayscale"
  | "sepia"
  | "blur"
  | "vintage"
  | "vivid"
  | "cool"
  | "warm"
  | "invert";

export type TransitionId =
  | "fade"
  | "dissolve"
  | "slide"
  | "wipe"
  | "zoom"
  | "flip";

export interface Transition {
  id: string;
  kind: TransitionId;
  track: number;
  // placed between two clips; anchored at this px position on the track
  start: number; // px
  duration: number; // seconds
  // The clips this transition sits between, captured at creation time so
  // save doesn't have to re-guess the pairing positionally.
  clipAId: string;
  clipBId: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const uid = (p = "id") =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
// Guards against overlapping save() calls firing concurrent PUTs: while one
// is in flight, at most one follow-up save is queued (using the freshest
// state once it fires) instead of racing a stale response against a newer
// one. `false` (a deliberate/manual save) always wins over a queued `true`.
let saveInFlight: Promise<void> | null = null;
let savePendingAfterCurrent: boolean | null = null;

const HISTORY_LIMIT = 100;

interface HistorySnapshot {
  clips: Clip[];
  elements: StageElement[];
  tracks: Track[];
  transitions: Transition[];
  background: string;
  aspect: AspectId;
  zoom: number;
  snap: boolean;
  globalMuted: boolean;
  projectName: string;
  settings: {
    fps: 24 | 30 | 60;
    resolution: "720" | "1080" | "1440" | "4k";
    theme: "dark" | "light";
    snapping: boolean;
    showGuides: boolean;
  };
}

function takeSnapshot(s: {
  clips: Clip[]; elements: StageElement[]; tracks: Track[];
  transitions: Transition[]; background: string; aspect: AspectId;
  zoom: number; snap: boolean; globalMuted: boolean;
  projectName: string; settings: HistorySnapshot["settings"];
}): HistorySnapshot {
  return {
    clips: s.clips.map((c) => ({ ...c, audio: c.audio ? { ...c.audio } : undefined })),
    elements: s.elements.map((e) => ({ ...e })),
    tracks: s.tracks.map((t) => ({ ...t })),
    transitions: s.transitions.map((t) => ({ ...t })),
    background: s.background,
    aspect: s.aspect,
    zoom: s.zoom,
    snap: s.snap,
    globalMuted: s.globalMuted,
    projectName: s.projectName,
    settings: { ...s.settings },
  };
}


function readLS(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota */
  }
}

/* ---- Rehydration from localStorage (scoped per project) ---- */
function projectStateKey(projectId: string) {
  return `vs_project_state_${projectId}`;
}

function projectNameKey(projectId: string) {
  return `vs_project_name_${projectId}`;
}

function loadSavedStateForProject(projectId: string) {
  try {
    const raw = readLS(projectStateKey(projectId), "");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      clips: Array.isArray(parsed.clips) ? (parsed.clips as Clip[]) : INITIAL_CLIPS,
      elements: Array.isArray(parsed.elements) ? (parsed.elements as StageElement[]) : [],
      transitions: Array.isArray(parsed.transitions) ? (parsed.transitions as Transition[]) : [],
      tracks: Array.isArray(parsed.tracks) ? (parsed.tracks as Track[]) : INITIAL_TRACKS,
      aspect: (parsed.aspect as AspectId) || "9:16",
      background: (parsed.background as string) || "linear-gradient(135deg, oklch(0.22 0.005 260), oklch(0.16 0.005 260))",
      projectMedia: Array.isArray(parsed.projectMedia) ? (parsed.projectMedia as MediaItem[]) : [],
    };
  } catch {
    return null;
  }
}

function loadSavedLibrary(): MediaItem[] {
  return [];
}

const DEFAULT_BACKGROUND =
  "linear-gradient(135deg, oklch(0.22 0.005 260), oklch(0.16 0.005 260))";

/* ---- Overlap avoidance for store-level operations ---- */
function avoidOverlapStore(
  start: number, width: number, selfId: string, track: number, clips: Clip[],
): number {
  const others = clips
    .filter((c) => c.track === track && c.id !== selfId)
    .sort((a, b) => a.start - b.start);
  let s = Math.max(0, start);
  for (let i = 0; i < clips.length + 1; i++) {
    let bumped = false;
    for (const o of others) {
      const oEnd = o.start + o.width;
      if (s < oEnd && s + width > o.start) { s = oEnd; bumped = true; }
    }
    if (!bumped) break;
  }
  return s;
}

const INITIAL_ELEMENTS: StageElement[] = [];

const DEFAULT_CLIP_SECONDS = 5;
/** Minimum subtitle block width on timeline (4px ≈ 0.2s at default zoom). */
const MIN_SUBTITLE_CLIP_PX = 4;

function nextStartOnTrack(clips: Clip[], track: number, exceptId?: string): number {
  return clips
    .filter((c) => c.track === track && c.id !== exceptId)
    .reduce((acc, c) => Math.max(acc, c.start + c.width), 0);
}

function cloneStageElementForClip(elements: StageElement[], elementId?: string): StageElement | null {
  const source = elementId ? elements.find((e) => e.id === elementId) : null;
  return source ? { ...source, id: uid("el") } : null;
}

function clipKindFor(kind: StageElementKind): ClipKind {
  if (kind === "text") return "text";
  if (kind === "video") return "video";
  if (kind === "image") return "image";
  return "overlay"; // shapes, stickers
}

function labelFor(el: Omit<StageElement, "id"> & { id?: string }): string {
  if (el.kind === "text") return (el.text || "Text").slice(0, 24);
  if (el.kind === "sticker") return el.emoji || "Sticker";
  if (el.kind === "image") return "Image";
  if (el.kind === "video") return "Video";
  return el.kind.charAt(0).toUpperCase() + el.kind.slice(1);
}

function isVisualMediaClip(c: Clip): boolean {
  return c.kind === "video" || c.kind === "image" || c.kind === "overlay";
}

function buildMediaAllowlist(projectMedia: Omit<MediaItem, "id">[]) {
  const assetIds = new Set(
    projectMedia.map((m) => m.mediaAssetId).filter((id): id is string => !!id),
  );
  const srcs = new Set(projectMedia.map((m) => m.src).filter(Boolean));
  return { assetIds, srcs };
}

function isAllowedMediaRef(
  ref: { mediaAssetId?: string; src?: string },
  allow: ReturnType<typeof buildMediaAllowlist>,
): boolean {
  if (ref.src?.startsWith("blob:")) return true;
  if (ref.mediaAssetId && allow.assetIds.has(ref.mediaAssetId)) return true;
  if (ref.src && allow.srcs.has(ref.src)) return true;
  return false;
}

/** Keep user timeline media scoped to the current project's asset list. */
function scopeUserMediaToProject(
  clips: Clip[],
  elements: StageElement[],
  sessionMedia: MediaItem[],
  projectMedia: Omit<MediaItem, "id">[],
) {
  const allow = buildMediaAllowlist(projectMedia);
  const scopedClips = clips.filter(
    (c) => !isVisualMediaClip(c) || isAllowedMediaRef(c, allow),
  );
  const referencedElementIds = new Set(
    scopedClips.map((c) => c.elementId).filter((id): id is string => !!id),
  );
  const scopedElements = elements.filter((e) => {
    if (e.kind === "video" || e.kind === "image") {
      return isAllowedMediaRef(e, allow) && referencedElementIds.has(e.id);
    }
    return referencedElementIds.has(e.id);
  });
  const mergedMedia: MediaItem[] = [];
  for (const media of projectMedia) {
    if (!mergedMedia.some((m) => (media.mediaAssetId && m.mediaAssetId === media.mediaAssetId) || m.src === media.src)) {
      mergedMedia.unshift({ ...media, id: uid("pm") });
    }
  }
  for (const m of sessionMedia) {
    if (
      isAllowedMediaRef(m, allow) &&
      !mergedMedia.some((x) => (m.mediaAssetId && x.mediaAssetId === m.mediaAssetId) || x.src === m.src)
    ) {
      mergedMedia.push(m);
    }
  }
  return { clips: scopedClips, elements: scopedElements, projectMedia: mergedMedia };
}


/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

interface EditorState {
  activeProjectId: string | null;
  deletedMediaAssetIds: Set<string>;
  loadProjectSession: (projectId: string, projectTitle: string) => void;
  /** Restore R2 URLs for persisted clips/media after reload (blob URLs expire). */
  reconcileProjectMedia: (apiMedia: Omit<MediaItem, "id">[]) => void;

  projectName: string;
  setProjectName: (n: string) => void;

  // saving
  dirty: boolean;
  autosave: boolean;
  lastSavedAt: number | null;
  toggleAutosave: () => void;
  markDirty: () => void;
  save: (isAutosave?: boolean) => void;

  activeTool: ToolId;
  setActiveTool: (t: ToolId) => void;

  selectedClipIds: string[];
  selectClip: (id: string | null, additive?: boolean) => void;
  selectAllClips: () => void;

  clips: Clip[];
  addClip: (c: Omit<Clip, "id">) => string;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  removeClip: (id: string) => void;
  rippleDeleteClip: (id: string) => void;
  duplicateClip: (id: string) => string | null;
  splitClipAtPlayhead: (id: string) => void;

  // history (undo / redo)
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  _history: { past: HistorySnapshot[]; future: HistorySnapshot[] };


  // tracks
  tracks: Track[];
  addTrack: (kind: TrackKind) => number;
  ensureTrackForKind: (kind: TrackKind) => number;
  removeTrack: (id: number) => void;
  cleanupEmptyTracks: () => void;
  moveClipToTrack: (clipId: string, trackId: number, startPosition?: number) => void;

  // media libraries
  library: MediaItem[]; // user global library from /api/media
  setLibrary: (items: MediaItem[]) => void;
  loadUserLibrary: () => Promise<void>;
  projectMedia: MediaItem[]; // current project
  addToLibrary: (m: Omit<MediaItem, "id">) => MediaItem | null;
  addToProjectMedia: (m: Omit<MediaItem, "id">) => MediaItem | null;
  replaceMediaSource: (oldSrc: string, next: Partial<MediaItem> & { src: string }) => void;
  removeLibraryItem: (id: string) => Promise<void>;
  removeProjectMedia: (id: string) => Promise<void>;
  importLibraryItemToProject: (id: string) => void;

  // place media on the timeline / canvas
  addMediaToTimeline: (m: MediaItem, atPlayhead?: boolean) => void;

  // stage elements (canvas)
  elements: StageElement[];
  selectedElementId: string | null;
  selectElement: (id: string | null) => void;
  addElement: (el: Omit<StageElement, "id">) => string;
  updateElement: (id: string, patch: Partial<StageElement>) => void;
  removeElement: (id: string) => void;

  // transitions
  transitions: Transition[];
  selectedTransitionId: string | null;
  selectTransition: (id: string | null) => void;
  addTransition: (t: Omit<Transition, "id">) => string;
  updateTransition: (id: string, patch: Partial<Transition>) => void;
  removeTransition: (id: string) => void;

  aspect: AspectId;
  setAspect: (a: AspectId) => void;

  background: string;
  setBackground: (b: string) => void;

  loadTemplate: (els: Omit<StageElement, "id">[], bg: string, aspect: AspectId) => void;

  playing: boolean;
  togglePlay: () => void;
  playhead: number;
  setPlayhead: (n: number) => void;

  zoom: number;
  setZoom: (n: number) => void;

  snap: boolean;
  toggleSnap: () => void;

  globalMuted: boolean;
  toggleGlobalMute: () => void;

  // settings
  settings: {
    fps: 24 | 30 | 60;
    resolution: "720" | "1080" | "1440" | "4k";
    theme: "dark" | "light";
    snapping: boolean;
    showGuides: boolean;
  };
  setSetting: <K extends keyof EditorState["settings"]>(
    k: K,
    v: EditorState["settings"][K],
  ) => void;

  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;

  exportOpen: boolean;
  setExportOpen: (v: boolean) => void;

  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;

  // auto-inject project title / captions / voice onto the timeline
  hydrateProject: (data: {
    title?: string;
    titleCards?: {
      text: string;
      startMs: number;
      endMs: number;
      titleStyle?: Record<string, any>;
    }[];
    captions?: {
      text: string;
      start: number;
      end?: number;
      words?: any[];
    }[];
    subtitleStyle?: Record<string, any>;
    voiceUrl?: string;
    voiceDuration?: number;
    projectMedia?: Omit<MediaItem, "id">[];
  }) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  activeProjectId: null,
  deletedMediaAssetIds: new Set(),

  loadProjectSession: (projectId, projectTitle) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("vs_project_state");
        window.localStorage.removeItem("vs_project_name");
      } catch {
        /* ignore */
      }
    }
    const saved = loadSavedStateForProject(projectId);
    const savedTracks = saved?.tracks ?? INITIAL_TRACKS;
    const uniqueTracksMap = new Map<number, Track>();
    for (const t of savedTracks) {
      if (!uniqueTracksMap.has(t.id)) {
        uniqueTracksMap.set(t.id, t);
      }
    }
    const finalTracks = Array.from(uniqueTracksMap.values());

    set({
      activeProjectId: projectId,
      deletedMediaAssetIds: new Set(),
      projectName: projectTitle || readLS(projectNameKey(projectId), "Untitled Project"),
      clips: saved?.clips ?? INITIAL_CLIPS,
      elements: saved?.elements ?? INITIAL_ELEMENTS,
      transitions: saved?.transitions ?? [],
      tracks: finalTracks,
      aspect: saved?.aspect ?? "9:16",
      background: saved?.background ?? DEFAULT_BACKGROUND,
      projectMedia: saved?.projectMedia ?? [],
      selectedClipIds: [],
      selectedElementId: null,
      selectedTransitionId: null,
      dirty: false,
      _history: { past: [], future: [] },
    });
  },

  reconcileProjectMedia: (apiMedia) => {
    const deleted = get().deletedMediaAssetIds;
    const filteredApiMedia = apiMedia.filter(
      (m) => !m.mediaAssetId || !deleted.has(m.mediaAssetId),
    );
    const byAssetId = new Map(
      filteredApiMedia
        .filter((m) => m.mediaAssetId)
        .map((m) => [m.mediaAssetId as string, m]),
    );
    const bySrc = new Map(filteredApiMedia.map((m) => [m.src, m]));

    const repairRef = <T extends { mediaAssetId?: string; src?: string; thumb?: string; name?: string }>(
      ref: T,
    ): T | null => {
      if (ref.mediaAssetId && byAssetId.has(ref.mediaAssetId)) {
        const api = byAssetId.get(ref.mediaAssetId)!;
        return {
          ...ref,
          src: api.src,
          thumb: api.thumb ?? api.src,
          name: api.name || ref.name,
        };
      }
      if (ref.src && bySrc.has(ref.src)) return ref;
      if (ref.src?.startsWith("blob:")) return null;
      if (ref.src?.startsWith("http")) return ref;
      return ref.src ? ref : null;
    };

    set((s) => {
      const mergedMedia: MediaItem[] = [];
      for (const media of filteredApiMedia) {
        if (!mergedMedia.some((m) => (media.mediaAssetId && m.mediaAssetId === media.mediaAssetId) || m.src === media.src)) {
          mergedMedia.unshift({ ...media, id: uid("pm") });
        }
      }
      for (const m of s.projectMedia) {
        const repaired = repairRef(m);
        if (
          repaired &&
          !mergedMedia.some((x) => (repaired.mediaAssetId && x.mediaAssetId === repaired.mediaAssetId) || x.src === repaired.src)
        ) {
          mergedMedia.push({ ...m, ...repaired });
        }
      }

      const clips = s.clips
        .map((c) => {
          if (c.kind !== "video" && c.kind !== "image" && c.kind !== "audio") return c;
          const repaired = repairRef(c);
          return repaired ? { ...c, ...repaired } : c;
        })
        .filter((c) => {
          if (c.kind === "video" || c.kind === "image") {
            return !!c.src && !c.src.startsWith("blob:");
          }
          if (c.kind === "audio") return !!c.src && !c.src.startsWith("blob:");
          return true;
        });

      const clipElementIds = new Set(clips.map((c) => c.elementId).filter(Boolean) as string[]);
      const elements = s.elements
        .map((e) => {
          if (e.kind !== "video" && e.kind !== "image") return e;
          const repaired = repairRef(e);
          return repaired ? { ...e, ...repaired } : e;
        })
        .filter((e) => {
          if (e.kind === "video" || e.kind === "image") {
            return clipElementIds.has(e.id) && !!e.src && !e.src.startsWith("blob:");
          }
          return clipElementIds.has(e.id);
        });

      return { projectMedia: mergedMedia, clips, elements };
    });
    get().markDirty();
    get().save();
  },

  projectName: "Untitled Project",
  setProjectName: (n) => {
    const pid = get().activeProjectId;
    if (pid) writeLS(projectNameKey(pid), n);
    set({ projectName: n, dirty: true });
  },

  dirty: false,
  autosave: true,
  lastSavedAt: null,
  toggleAutosave: () => set((s) => ({ autosave: !s.autosave })),
  markDirty: () => {
    set({ dirty: true });
    if (get().autosave) {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        autosaveTimer = null;
        if (get().autosave && get().dirty) get().save();
      }, 800);
    }
  },
  save: (isAutosave = true) => {
    const s = get();
    const pid = s.activeProjectId;
    if (!pid) return;
    writeLS(projectNameKey(pid), s.projectName);
    try {
      writeLS(
        projectStateKey(pid),
        JSON.stringify({
          clips: s.clips,
          elements: s.elements,
          transitions: s.transitions,
          tracks: s.tracks,
          aspect: s.aspect,
          background: s.background,
          projectMedia: s.projectMedia,
          settings: s.settings,
          lastSavedAt: Date.now(),
        }),
      );
    } catch {
      /* ignore */
    }
    set({ dirty: false, lastSavedAt: Date.now() });

    if (saveInFlight) {
      // A manual save's intent to not be overwritten-in-place always wins
      // over a queued autosave.
      savePendingAfterCurrent = savePendingAfterCurrent === false ? false : isAutosave;
      return;
    }

    const runSave = (autosave: boolean): Promise<void> =>
      import("./timeline-sync")
        .then(({ saveEditorTimeline }) => saveEditorTimeline(pid, autosave))
        .catch((err) => console.error("[editor] Failed to persist timeline to server", err))
        .then(() => {
          if (savePendingAfterCurrent !== null) {
            const next = savePendingAfterCurrent;
            savePendingAfterCurrent = null;
            saveInFlight = runSave(next);
          } else {
            saveInFlight = null;
          }
        });

    saveInFlight = runSave(isAutosave);
  },

  activeTool: "media",
  setActiveTool: (t) => set({ activeTool: t }),

  selectedClipIds: [],
  selectClip: (id, additive) => {
    if (id === null) {
      set({ selectedClipIds: [], selectedElementId: null, selectedTransitionId: null });
    } else if (additive) {
      set((s) => ({
        selectedClipIds: s.selectedClipIds.includes(id)
          ? s.selectedClipIds.filter((x) => x !== id)
          : [...s.selectedClipIds, id],
        selectedElementId: null,
        selectedTransitionId: null,
      }));
    } else {
      set({ selectedClipIds: [id], selectedElementId: null, selectedTransitionId: null });
    }
  },
  selectAllClips: () => {
    set((s) => ({
      selectedClipIds: s.clips.map((c) => c.id),
      selectedElementId: null,
      selectedTransitionId: null,
    }));
  },

  clips: INITIAL_CLIPS,
  tracks: INITIAL_TRACKS,
  addTrack: (kind) => {
    const id = (get().tracks.reduce((m, t) => Math.max(m, t.id), 0) || 0) + 1;
    const count = get().tracks.filter((t) => t.kind === kind).length + 1;
    const label = `${TRACK_LABEL[kind]} ${count}`;
    set((s) => ({ tracks: [...s.tracks, { id, kind, label }] }));
    return id;
  },
  ensureTrackForKind: (kind) => {
    const found = get().tracks.find((t) => t.kind === kind && !t.locked);
    if (found) return found.id;
    return get().addTrack(kind);
  },
  removeTrack: (id) => {
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) }));
  },
  cleanupEmptyTracks: () => {
    set((s) => {
      const clipsByTrack = new Map<number, number>();
      for (const c of s.clips) {
        clipsByTrack.set(c.track, (clipsByTrack.get(c.track) || 0) + 1);
      }

      const finalTracks = s.tracks.filter((t) => {
        const count = clipsByTrack.get(t.id) || 0;
        const isBaseTrack = t.id <= 5;
        return count > 0 || t.locked || isBaseTrack;
      });

      if (finalTracks.length !== s.tracks.length) {
        return { tracks: finalTracks };
      }
      return s;
    });
  },
  moveClipToTrack: (clipId, trackId, startPosition) => {
    const clip = get().clips.find((c) => c.id === clipId);
    if (!clip || clip.frozen) return;
    get().pushHistory();
    const track = get().tracks.find((t) => t.id === trackId);
    let targetId = trackId;
    if (!track || track.kind !== clip.kind) {
      // create a new track of the clip's kind (different-kind drop)
      targetId = get().addTrack(clip.kind);
    }
    const start = startPosition ?? nextStartOnTrack(get().clips, targetId, clipId);
    set((s) => ({
      clips: s.clips.map((c) => (c.id === clipId ? { ...c, track: targetId, start } : c)),
    }));
    get().markDirty();
  },
  addClip: (c) => {
    const id = uid("clip");
    set((s) => ({ clips: [...s.clips, { ...c, id, source: c.source ?? "user" }], selectedClipIds: [id] }));
    get().markDirty();
    return id;
  },
  updateClip: (id, patch) => {
    const clip = get().clips.find(c => c.id === id);
    if (clip) {
      if (clip.frozen && patch.frozen === undefined) return;
      const track = get().tracks.find(t => t.id === clip.track);
      if ((track as any)?.locked) return;
    }
    
    let resolvedPatch = { ...patch };
    if (
      clip &&
      clip.kind !== "subtitle" &&
      (patch.start !== undefined ||
        patch.width !== undefined ||
        patch.track !== undefined)
    ) {
      const nextStart = patch.start !== undefined ? patch.start : clip.start;
      const nextWidth = patch.width !== undefined ? patch.width : clip.width;
      const nextTrack = patch.track !== undefined ? patch.track : clip.track;
      
      resolvedPatch.start = avoidOverlapStore(
        nextStart,
        nextWidth,
        id,
        nextTrack,
        get().clips
      );
    }
    
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, ...resolvedPatch } : c)),
    }));
    get().markDirty();
  },
  removeClip: (id) => {
    const clip = get().clips.find(c => c.id === id);
    if (clip) {
      if (clip.frozen) return;
      const track = get().tracks.find(t => t.id === clip.track);
      if ((track as any)?.locked) return;
    }
    set((s) => {
      const c = s.clips.find((x) => x.id === id);
      const linkedElementId = c?.elementId;
      const remainingClips = s.clips.filter((x) => x.id !== id);
      // Only remove the linked element if no other clip still references it
      const stillReferenced =
        linkedElementId &&
        remainingClips.some((rc) => rc.elementId === linkedElementId);
      const elementsAfter =
        linkedElementId && !stillReferenced
          ? s.elements.filter((e) => e.id !== linkedElementId)
          : s.elements;
      return {
        clips: remainingClips,
        elements: elementsAfter,
        selectedClipIds: s.selectedClipIds.filter((x) => x !== id),
        selectedElementId:
          !stillReferenced && s.selectedElementId === linkedElementId
            ? null
            : s.selectedElementId,
      };
    });
    get().markDirty();
  },
  rippleDeleteClip: (id) => {
    const clip = get().clips.find(c => c.id === id);
    if (clip) {
      if (clip.frozen) return;
      const track = get().tracks.find(t => t.id === clip.track);
      if ((track as any)?.locked) return;
    }
    set((s) => {
      const c = s.clips.find((x) => x.id === id);
      if (!c) return s;

      const trackId = c.track;
      const startPx = c.start;
      const shiftPx = c.width;

      const remainingClips = s.clips.filter((x) => x.id !== id).map((clip) => {
        // Shift all subsequent clips on the same track leftwards
        if (clip.track === trackId && clip.start > startPx) {
          return { ...clip, start: Math.max(0, clip.start - shiftPx) };
        }
        return clip;
      });

      const remainingTransitions = s.transitions.map((tr) => {
        if (tr.track !== trackId || tr.start <= startPx) return tr;
        return { ...tr, start: Math.max(0, tr.start - shiftPx) };
      });

      const linkedElementId = c?.elementId;
      const stillReferenced =
        linkedElementId && remainingClips.some((rc) => rc.elementId === linkedElementId);
      const elementsAfter =
        linkedElementId && !stillReferenced
          ? s.elements.filter((e) => e.id !== linkedElementId)
          : s.elements;

      return {
        clips: remainingClips,
        transitions: remainingTransitions,
        elements: elementsAfter,
        selectedClipIds: s.selectedClipIds.filter((x) => x !== id),
        selectedElementId:
          !stillReferenced && s.selectedElementId === linkedElementId ? null : s.selectedElementId,
      };
    });
    get().markDirty();
  },
  duplicateClip: (id) => {
    const c = get().clips.find((x) => x.id === id);
    if (!c || c.frozen) return null;
    const newId = uid("clip");
    const clonedElement = cloneStageElementForClip(get().elements, c.elementId);
    const start = avoidOverlapStore(c.start + c.width, c.width, newId, c.track, get().clips);
    set((s) => ({
      elements: clonedElement ? [...s.elements, clonedElement] : s.elements,
      clips: [
        ...s.clips,
        { ...c, id: newId, start, name: c.name, elementId: clonedElement?.id ?? c.elementId },
      ],
      selectedClipIds: [newId],
    }));
    get().markDirty();
    return newId;
  },
  splitClipAtPlayhead: (id) => {
    const c = get().clips.find((x) => x.id === id);
    if (!c || c.frozen) return;
    const track = get().tracks.find(t => t.id === c.track);
    if ((track as any)?.locked) return;
    let cutPx = get().playhead * PX_PER_SECOND;
    if (get().settings.snapping) {
      const edge = Math.round(cutPx);
      if (Math.abs(edge - c.start) <= 8) cutPx = c.start;
      else if (Math.abs(edge - (c.start + c.width)) <= 8) cutPx = c.start + c.width;
      else cutPx = edge;
    }
    if (cutPx <= c.start + 4 || cutPx >= c.start + c.width - 4) return;
    const leftWidth = cutPx - c.start;
    const rightWidth = c.width - leftWidth;
    const leftSeconds = leftWidth / PX_PER_SECOND;
    const rightId = uid("clip");
    const clonedElement = cloneStageElementForClip(get().elements, c.elementId);
    set((s) => ({
      elements: clonedElement ? [...s.elements, clonedElement] : s.elements,
      clips: s.clips.map((x) =>
        x.id === id ? { ...x, width: leftWidth } : x,
      ).concat({
        ...c,
        id: rightId,
        elementId: clonedElement?.id ?? c.elementId,
        start: cutPx,
        width: rightWidth,
        mediaStart: (c.mediaStart ?? 0) + leftSeconds,
      }),
      selectedClipIds: [rightId],
    }));
    get().markDirty();
  },

  // ---------------- History ----------------
  undo: () => {
    if (!get()._history.past.length) return;
    set((s) => {
      const past = s._history.past;
      const previous = past[past.length - 1];
      const snapshot = takeSnapshot(s);
      return {
        ...previous,
        _history: {
          past: past.slice(0, -1),
          future: [snapshot, ...s._history.future].slice(0, HISTORY_LIMIT),
        },
      };
    });
    get().markDirty();
  },
  redo: () => {
    if (!get()._history.future.length) return;
    set((s) => {
      const future = s._history.future;
      const next = future[0];
      const snapshot = takeSnapshot(s);
      return {
        ...next,
        _history: {
          past: [...s._history.past, snapshot].slice(-HISTORY_LIMIT),
          future: future.slice(1),
        },
      };
    });
    get().markDirty();
  },
  pushHistory: () => {
    set((s) => ({
      _history: {
        past: [...s._history.past, takeSnapshot(s)].slice(-HISTORY_LIMIT),
        future: [],
      },
    }));
  },
  canUndo: () => get()._history.past.length > 0,
  canRedo: () => get()._history.future.length > 0,
  _history: { past: [], future: [] },



  library: loadSavedLibrary(),
  setLibrary: (items) => set({ library: items }),
  loadUserLibrary: async () => {
    if (typeof window === "undefined") return;
    try {
      const res = await fetch("/api/media", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const media = Array.isArray(json.media) ? json.media : [];
      const items: MediaItem[] = media.map((m: Record<string, unknown>) => {
        const mime = String(m.mimeType ?? "");
        const kind: MediaItem["kind"] =
          mime.startsWith("video/") || m.type === "VIDEO" ? "video"
            : mime.startsWith("audio/") ? "audio" : "image";
        return {
          id: String(m.id),
          mediaAssetId: String(m.id),
          name: String(m.originalName ?? "Media"),
          kind,
          src: String(m.r2Url ?? ""),
          duration: Math.round((Number(m.durationMs) || 0) / 1000),
          size: Number(m.fileSizeBytes) || 0,
          thumb: (m.thumbnailUrl as string | null) ?? undefined,
        };
      });
      set({ library: items });
    } catch {
      /* ignore */
    }
  },
  projectMedia: [],
  addToLibrary: (m) => {
    const existing = get().library.find(
      (x) => (m.mediaAssetId && x.mediaAssetId === m.mediaAssetId) || (x.src === m.src && x.name === m.name),
    );
    if (existing) return existing;
    const item: MediaItem = { ...m, id: m.mediaAssetId ?? uid("lib") };
    set((s) => ({ library: [item, ...s.library.filter((x) => x.id !== item.id)] }));
    return item;
  },
  addToProjectMedia: (m) => {
    const existing = get().projectMedia.find(
      (x) => (m.mediaAssetId && x.mediaAssetId === m.mediaAssetId) || (x.name === m.name && x.size === m.size),
    );
    if (existing) return null;
    const item: MediaItem = { ...m, id: uid("pm") };
    set((s) => ({ projectMedia: [item, ...s.projectMedia] }));
    get().markDirty();
    return item;
  },
  replaceMediaSource: (oldSrc, next) => {
    const patchMedia = (m: MediaItem): MediaItem =>
      m.src === oldSrc
        ? { ...m, ...next, thumb: next.thumb ?? m.thumb, waveform: next.waveform ?? m.waveform }
        : m;
    set((s) => ({
      projectMedia: s.projectMedia.map(patchMedia),
      library: s.library.map(patchMedia),
      elements: s.elements.map((e) => e.src === oldSrc ? { ...e, src: next.src } : e),
      clips: s.clips.map((c) => c.src === oldSrc ? {
        ...c,
        src: next.src,
        thumb: next.thumb ?? c.thumb,
        mediaAssetId: next.mediaAssetId ?? c.mediaAssetId,
        sourceDuration: next.duration ?? c.sourceDuration,
        waveform: next.waveform ?? c.waveform,
      } : c),
    }));
    get().markDirty();
  },
  removeLibraryItem: async (id) => {
    const item = get().library.find((x) => x.id === id);
    if (item && item.src.startsWith("blob:")) URL.revokeObjectURL(item.src);
    if (item && item.thumb?.startsWith("blob:")) URL.revokeObjectURL(item.thumb);
    set((s) => ({ library: s.library.filter((x) => x.id !== id) }));
    try {
      await fetch(`/api/media?mediaId=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete library item from DB:", err);
    }
  },
  removeProjectMedia: async (id) => {
    const item = get().projectMedia.find((x) => x.id === id);
    if (item && item.src.startsWith("blob:")) URL.revokeObjectURL(item.src);
    if (item && item.thumb?.startsWith("blob:")) URL.revokeObjectURL(item.thumb);
    set((s) => ({ projectMedia: s.projectMedia.filter((x) => x.id !== id) }));
    
    const activeProjectId = get().activeProjectId;
    const mediaId = item?.mediaAssetId ?? item?.id;
    if (activeProjectId && mediaId && !mediaId.startsWith("blob:")) {
      set((s) => {
        const next = new Set(s.deletedMediaAssetIds);
        next.add(mediaId);
        return { deletedMediaAssetIds: next };
      });
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/media?mediaId=${mediaId}`, { method: "DELETE" });
        if (!res.ok) {
          console.error(`DELETE project media API returned non-OK status: ${res.status}`);
        }
      } catch (err) {
        console.error("Failed to delete project media from DB:", err);
      }
    }
    
    get().markDirty();
  },
  importLibraryItemToProject: (id) => {
    const item = get().library.find((x) => x.id === id);
    if (!item) return;
    get().addToProjectMedia({
      mediaAssetId: item.mediaAssetId,
      name: item.name,
      kind: item.kind,
      src: item.src,
      duration: item.duration,
      size: item.size,
      thumb: item.thumb,
    });
  },

  addMediaToTimeline: (m, atPlayhead = true) => {
    const playheadPx = atPlayhead ? Math.max(0, Math.round(get().playhead * PX_PER_SECOND)) : null;
    const placeStart = (track: number, width: number, exceptId?: string) => {
      if (m.kind === "video") {
        return nextStartOnTrack(get().clips, track, exceptId);
      }
      if (playheadPx != null) {
        return avoidOverlapStore(playheadPx, width, exceptId ?? "__new__", track, get().clips);
      }
      return nextStartOnTrack(get().clips, track, exceptId);
    };

    if (m.kind === "audio") {
      const seconds = m.duration > 0 ? m.duration : 5;
      const width = Math.max(60, seconds * PX_PER_SECOND);
      const track = get().ensureTrackForKind("audio");
      const start = placeStart(track, width);
      get().addClip({
        kind: "audio", name: m.name, start, width, track,
        src: m.src, mediaKind: "audio", mediaAssetId: m.mediaAssetId,
        sourceDuration: m.duration, waveform: m.waveform,
      });
      return;
    }
    // Video / image — create a stage element at playhead (or next free slot).
    const seconds = m.kind === "video" && m.duration > 0 ? m.duration : DEFAULT_CLIP_SECONDS;
    const id = get().addElement({
      kind: m.kind === "video" ? "video" : "image",
      x: 6, y: 6, w: 88, h: 88, rotation: 0,
      color: "#ffffff", src: m.src, opacity: 100, effect: "none", fit: "contain",
    });
    const clip = get().clips.find((c) => c.elementId === id);
    if (clip) {
      const width = Math.max(60, seconds * PX_PER_SECOND);
      const start = placeStart(clip.track, width, clip.id);
      get().updateClip(clip.id, {
        width,
        start,
        name: m.name,
        thumb: m.thumb ?? m.src,
        src: m.src,
        mediaKind: m.kind === "video" ? "video" : "image",
        mediaAssetId: m.mediaAssetId,
        sourceDuration: m.duration,
      });
    }
    void fitElementToMediaAspect(
      id,
      m.src,
      m.kind === "video" ? "video" : "image",
      get().aspect,
      get().updateElement,
    );
  },

  elements: INITIAL_ELEMENTS,
  selectedElementId: null,
  selectElement: (id) =>
    set({ selectedElementId: id, selectedClipIds: [], selectedTransitionId: null }),
  addElement: (el) => {
    const id = uid("el");
    const clipKind = clipKindFor(el.kind);
    const width = Math.max(60, DEFAULT_CLIP_SECONDS * PX_PER_SECOND);
    const clipId = uid("clip");
    
    set((s) => {
      let start = s.playhead * PX_PER_SECOND;
      let targetTrackId = -1;
      let nextTracks = s.tracks;

      if (clipKind === "video") {
        const videoTrack = s.tracks.find(t => t.kind === "video");
        if (videoTrack) {
          targetTrackId = videoTrack.id;
        } else {
          targetTrackId = (nextTracks.reduce((m, t) => Math.max(m, t.id), 0) || 0) + 1;
          nextTracks = [...nextTracks, { id: targetTrackId, kind: "video", label: "Video 1" }];
        }
        start = nextStartOnTrack(s.clips, targetTrackId);
      } else {
        const candidateTracks = s.tracks.filter(t => t.kind === clipKind && !t.locked);
        
        for (const t of candidateTracks) {
          const trackClips = s.clips.filter(c => c.track === t.id);
          const hasOverlap = trackClips.some(c => {
            const cEnd = c.start + c.width;
            const end = start + width;
            return start < cEnd && end > c.start;
          });
          if (!hasOverlap) {
            targetTrackId = t.id;
            break;
          }
        }

        if (targetTrackId === -1) {
          targetTrackId = (nextTracks.reduce((m, t) => Math.max(m, t.id), 0) || 0) + 1;
          const count = nextTracks.filter((t) => t.kind === clipKind).length + 1;
          const label = `${TRACK_LABEL[clipKind]} ${count}`;
          nextTracks = [...nextTracks, { id: targetTrackId, kind: clipKind, label }];
        }
      }

      const newClip: Clip = {
        id: clipId,
        kind: clipKind,
        name: labelFor(el),
        start,
        width,
        track: targetTrackId,
        elementId: id,
        src: el.src,
        thumb: el.kind === "image" ? el.src : el.kind === "video" ? el.src : undefined,
        mediaKind:
          el.kind === "video" ? "video" : el.kind === "image" ? "image" : undefined,
        color: el.color,
        source: "user",
      };
      return {
        tracks: nextTracks,
        elements: [...s.elements, { ...el, id, source: el.source ?? "user" }],
        clips: [...s.clips, newClip],
        selectedElementId: id,
        selectedClipIds: [],
      };
    });
    get().markDirty();
    return id;
  },
  updateElement: (id, patch) => {
    const clip = get().clips.find((c) => c.elementId === id);
    if (clip) {
      if (clip.frozen) return;
      const track = get().tracks.find((t) => t.id === clip.track);
      if ((track as any)?.locked) return;
    }
    set((s) => ({
      elements: s.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      // keep clip name in sync when text changes
      clips:
        patch.text !== undefined
          ? s.clips.map((c) =>
              c.elementId === id ? { ...c, name: (patch.text || "Text").slice(0, 24) } : c,
            )
          : s.clips,
    }));
    get().markDirty();
  },
  removeElement: (id) => {
    const clip = get().clips.find((c) => c.elementId === id);
    if (clip) {
      if (clip.frozen) return;
      const track = get().tracks.find((t) => t.id === clip.track);
      if ((track as any)?.locked) return;
    }
    set((s) => ({
      elements: s.elements.filter((e) => e.id !== id),
      clips: s.clips.filter((c) => c.elementId !== id),
      selectedElementId: s.selectedElementId === id ? null : s.selectedElementId,
    }));
    get().markDirty();
  },

  transitions: [],
  selectedTransitionId: null,
  selectTransition: (id) =>
    set({ selectedTransitionId: id, selectedClipIds: [], selectedElementId: null }),
  addTransition: (t) => {
    const id = uid("tr");
    set((s) => ({ transitions: [...s.transitions, { ...t, id }], selectedTransitionId: id }));
    get().markDirty();
    return id;
  },
  updateTransition: (id, patch) => {
    set((s) => ({
      transitions: s.transitions.map((tr) => (tr.id === id ? { ...tr, ...patch } : tr)),
    }));
    get().markDirty();
  },
  removeTransition: (id) => {
    set((s) => ({
      transitions: s.transitions.filter((t) => t.id !== id),
      selectedTransitionId: s.selectedTransitionId === id ? null : s.selectedTransitionId,
    }));
    get().markDirty();
  },

  aspect: "9:16" as AspectId,
  setAspect: (a) => { set({ aspect: a }); get().markDirty(); },

  background: DEFAULT_BACKGROUND,
  setBackground: (b) => { set({ background: b }); get().markDirty(); },

  loadTemplate: (els, bg, aspect) => {
    const elements = els.map((e) => ({ ...e, id: uid("el") }));
    const newClips: Clip[] = [];
    let offset = 0;
    for (const el of elements) {
      const ck = clipKindFor(el.kind);
      const track = get().ensureTrackForKind(ck);
      const width = Math.max(60, DEFAULT_CLIP_SECONDS * PX_PER_SECOND);
      newClips.push({
        id: uid("clip"), kind: ck, name: labelFor(el),
        start: offset, width, track, elementId: el.id, color: el.color,
      });
      offset += width;
    }
    set((s) => ({
      elements,
      clips: [...s.clips, ...newClips],
      background: bg,
      aspect,
      selectedElementId: elements[0]?.id ?? null,
      selectedClipIds: [],
    }));
    get().markDirty();
  },

  playing: false,
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  playhead: 0,
  setPlayhead: (n) => set({ playhead: Math.max(0, n) }),

  zoom: 1,
  setZoom: (n) => set({ zoom: n }),

  snap: true,
  toggleSnap: () => set((s) => ({ snap: !s.snap })),

  globalMuted: false,
  toggleGlobalMute: () => set((s) => ({ globalMuted: !s.globalMuted })),

  settings: {
    fps: 30,
    resolution: "1080",
    theme: "dark",
    snapping: true,
    showGuides: true,
  },
  setSetting: (k, v) =>
    set((s) => ({ settings: { ...s.settings, [k]: v } })),

  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),

  exportOpen: false,
  setExportOpen: (v) => set({ exportOpen: v }),

  shortcutsOpen: false,
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),

  hydrateProject: ({ title, titleCards, captions, subtitleStyle, voiceUrl, voiceDuration, projectMedia }) => {
    get().pushHistory();
    const textTrack = 3;
    const subtitleTrack = 5;
    const audioTrack = 4;
    set((s) => {
      // Drop existing AI-hydrated content, AND drop studio title/subtitle overlays from database restore.
      // This allows the editor to always load the latest text, translation, styling, and timing from the DB.
      let elements = s.elements.filter((e) => {
        if (e.source === "ai") return false;
        if (e.studioOverlay === "subtitle" || e.studioOverlay === "title") return false;
        return true;
      });

      let clips = s.clips.filter((c) => {
        if (c.source === "ai") return false;
        if (c.kind === "subtitle") return false;
        const el = s.elements.find((e) => e.id === c.elementId);
        if (c.kind === "text" && el?.studioOverlay === "title") return false;
        return true;
      });

      const scoped = scopeUserMediaToProject(clips, elements, s.projectMedia, projectMedia ?? []);
      clips = scoped.clips;
      elements = scoped.elements;

      const tracks = [...s.tracks];
      const baseTracks = [
        { id: 1, kind: "video" as const, label: "Video 1", locked: false },
        { id: 2, kind: "image" as const, label: "Image 1", locked: false },
        { id: 3, kind: "text" as const, label: "Text 1", locked: true },
        { id: 4, kind: "audio" as const, label: "Audio 1", locked: true },
        { id: 5, kind: "subtitle" as const, label: "Subtitles", locked: true },
      ];
      baseTracks.forEach((bt) => {
        const existing = tracks.find((t) => t.id === bt.id);
        if (!existing) {
          tracks.push({ id: bt.id, kind: bt.kind, label: bt.label, locked: bt.locked });
        } else {
          if (bt.kind === "audio") {
            existing.muted = false;
            existing.hidden = false;
          }
        }
      });

      let currentTextTrackIdx = 0;

      // Add latest title cards (rebuilt from latest DB data)
      if (titleCards && titleCards.length > 0) {
        titleCards.forEach((card, index) => {
          const titleElId = uid("el");
          const displayText = stripFactCategoryPrefix(card.text || "");
          const stageTitle = mapTitleStyleToStage(card.titleStyle || {});
          elements.push({
            id: titleElId, kind: "text",
            rotation: 0,
            text: displayText,
            opacity: 100,
            source: "ai",
            animation: "none",
            ...stageTitle,
          });
          
          const startPx = (card.startMs / 1000) * PX_PER_SECOND;
          const endPx = (card.endMs / 1000) * PX_PER_SECOND;
          const widthPx = Math.max(1, endPx - startPx);
          
          clips.push({
            id: uid("clip"), kind: "text", name: displayText.slice(0, 40) || `Title ${index + 1}`,
            start: startPx, width: widthPx, track: textTrack, elementId: titleElId,
            source: "ai",
          });
        });
      } else if (title) {
        const titleElId = uid("el");
        const stageTitle = mapTitleStyleToStage({ fontSize: 72, fontWeight: 800, color: "#ffffff" });
        elements.push({
          id: titleElId, kind: "text", rotation: 0,
          text: title, opacity: 100, source: "ai",
          ...stageTitle,
        });
        clips.push({
          id: uid("clip"), kind: "text", name: `Title — ${title}`,
          start: 0, width: 160, track: textTrack, elementId: titleElId,
          source: "ai",
        });
      }

      // Add latest subtitle cues (rebuilt from latest DB cues/style)
      if (captions && captions.length) {
        const stageStyle = mapSubtitleStyleToStage((subtitleStyle ?? {}) as SubtitleStyle);
        const subClips: Clip[] = [];

        captions.forEach((cue) => {
          const cueElId = uid("el");
          elements.push({
            id: cueElId, kind: "text",
            rotation: 0,
            text: cue.text,
            opacity: 100,
            source: "ai",
            words: cue.words || [],
            ...stageStyle,
          });

          const startPx = cue.start * PX_PER_SECOND;
          const widthSec = Math.max(0.2, (cue.end ?? cue.start + 2) - cue.start);
          const widthPx = Math.max(MIN_SUBTITLE_CLIP_PX, widthSec * PX_PER_SECOND);

          subClips.push({
            id: uid("clip"), kind: "subtitle", name: cue.text.slice(0, 40),
            start: startPx, width: widthPx, track: subtitleTrack,
            elementId: cueElId, source: "ai",
          });
        });

        // Round clip start/widths and snap adjacent clips to prevent gaps
        subClips.sort((a, b) => a.start - b.start);
        for (let i = 0; i < subClips.length; i++) {
          const c = subClips[i];
          c.start = Math.round(c.start);
          c.width = Math.round(c.width);
          if (i > 0) {
            const prev = subClips[i - 1];
            const prevEnd = prev.start + prev.width;
            if (Math.abs(c.start - prevEnd) <= 5) {
              const diff = prevEnd - c.start;
              c.start = prevEnd;
              c.width = Math.max(MIN_SUBTITLE_CLIP_PX, c.width - diff);
            }
          }
          clips.push(c);
        }
      }

      // Always apply the latest subtitle style to ALL subtitle elements
      if (subtitleStyle) {
        const stageStyle = mapSubtitleStyleToStage(subtitleStyle as SubtitleStyle);
        elements = elements.map((el) => {
          if (
            el.studioOverlay === "subtitle" ||
            (el.kind === "text" && clips.some((c) => c.elementId === el.id && c.kind === "subtitle"))
          ) {
            return {
              ...el,
              color: stageStyle.color,
              fontSize: stageStyle.fontSize,
              fontWeight: stageStyle.fontWeight,
              fontFamily: stageStyle.fontFamily,
              italic: stageStyle.italic,
              backgroundColor: stageStyle.backgroundColor,
              stroke: stageStyle.stroke,
              strokeColor: stageStyle.strokeColor,
              strokeWidth: stageStyle.strokeWidth,
              shadow: stageStyle.shadow,
              highlightColor: stageStyle.highlightColor,
              animation: stageStyle.animation,
            };
          }
          return el;
        });
      }

      // Always apply the latest title style to ALL title elements
      if (titleCards && titleCards.length > 0) {
        const firstStyle = titleCards.find((c) => c.titleStyle)?.titleStyle;
        if (firstStyle) {
          const stageTitleStyle = mapTitleStyleToStage(firstStyle);
          elements = elements.map((el) => {
            const isTitleElement =
              el.studioOverlay === "title" ||
              (el.kind === "text" && clips.some((c) => c.elementId === el.id && c.kind === "text"));
            if (isTitleElement) {
              return {
                ...el,
                color: stageTitleStyle.color,
                fontSize: stageTitleStyle.fontSize,
                fontWeight: stageTitleStyle.fontWeight,
                fontFamily: stageTitleStyle.fontFamily,
                italic: stageTitleStyle.italic,
                underline: stageTitleStyle.underline,
                letterSpacing: stageTitleStyle.letterSpacing,
                backgroundColor: stageTitleStyle.backgroundColor,
                shadow: stageTitleStyle.shadow,
              };
            }
            return el;
          });
        }
      }

      if (voiceUrl) {
        clips.push({
          id: uid("clip"), kind: "audio", name: "AI Voiceover", start: 0,
          width: Math.max(120, (voiceDuration ?? 12) * PX_PER_SECOND),
          track: audioTrack, src: voiceUrl, source: "ai",
        });
      }

      const uniqueTracksMap = new Map<number, Track>();
      for (const t of tracks) {
        if (!uniqueTracksMap.has(t.id)) {
          uniqueTracksMap.set(t.id, t);
        }
      }
      const finalTracks = Array.from(uniqueTracksMap.values());

      return { elements, clips, projectMedia: scoped.projectMedia, tracks: finalTracks };
    });
    get().markDirty();
  },
}));
