/**
 * Editor State (Zustand + Immer + Zundo for undo/redo).
 * Single source of truth for everything the UI renders.
 *
 * - All timeline mutations go through actions on this store.
 * - History is captured by `temporal` (zundo) — `undo()` / `redo()` are exposed.
 * - Playback state lives here too; the PlaybackClock writes to `currentTime`.
 * - Autosave: every change schedules `adapter.saveTimeline` ~300ms later.
 */
import { create } from "zustand";
import { temporal } from "zundo";
import { produce } from "immer";
import { nanoid } from "nanoid";
import type { ProjectBundle, ID, MediaAsset } from "./contract";
import type { Clip, Timeline, Track, Scene, TrackKind } from "./schema";
import { buildTimelineFromProjectBundle } from "./builder";
import { getEditorAdapter } from "./adapter";

export type Tool = "select" | "split" | "text" | "hand";
export type LeftPanel = "media" | "text" | "subtitles" | "audio" | "effects" | "scenes" | "library" | "settings";

interface EditorState {
  // Data
  projectId: ID | null;
  bundle: ProjectBundle | null;
  timeline: Timeline | null;

  // UI
  loading: boolean;
  error: string | null;
  leftPanel: LeftPanel;
  selectedClipIds: ID[];
  selectedSceneId: ID | null;
  tool: Tool;
  zoom: number; // px per second
  scrollX: number;

  // Playback
  playing: boolean;
  currentTime: number; // seconds
  loop: boolean;
  muted: boolean;
  volume: number;

  // Actions: lifecycle
  loadProject: (projectId: ID) => Promise<void>;
  rebuildTimelineFromBundle: () => void;
  addMediaToBundle: (asset: MediaAsset) => void;

  // Actions: selection
  setSelectedClips: (ids: ID[]) => void;
  toggleClipSelection: (id: ID, additive?: boolean) => void;
  clearSelection: () => void;
  setSelectedScene: (id: ID | null) => void;

  // Actions: UI
  setLeftPanel: (p: LeftPanel) => void;
  setTool: (t: Tool) => void;
  setZoom: (z: number) => void;
  setScrollX: (x: number) => void;

  // Actions: playback
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (t: number) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;

  // Actions: timeline mutations
  updateClip: (id: ID, patch: Partial<Clip>) => void;
  moveClip: (id: ID, deltaSeconds: number) => void;
  resizeClip: (id: ID, edge: "left" | "right", deltaSeconds: number) => void;
  splitClipAt: (id: ID, time: number) => void;
  deleteClips: (ids: ID[]) => void;
  duplicateClips: (ids: ID[]) => void;
  addClip: (clip: Clip) => void;
  reorderClipToTrack: (id: ID, trackId: string) => void;

  // Settings
  updateTimelineSettings: (patch: { width?: number; height?: number; fps?: number }) => void;

  // Tracks
  toggleTrackLock: (id: ID) => void;
  toggleTrackHidden: (id: ID) => void;
  toggleTrackMuted: (id: ID) => void;

  // Scenes
  addScene: () => void;
  deleteScene: (id: ID) => void;
  duplicateScene: (id: ID) => void;
  reorderScenes: (order: ID[]) => void;
  updateScene: (id: ID, patch: Partial<Scene>) => void;

  // Keyframes
  addKeyframe: (
    clipId: ID,
    prop: "x" | "y" | "scale" | "rotation" | "opacity",
    t: number,
    v: number,
  ) => void;
  removeKeyframe: (
    clipId: ID,
    prop: "x" | "y" | "scale" | "rotation" | "opacity",
    t: number,
  ) => void;

  // Persistence / export
  exportTimelineJson: () => string;
  importTimeline: (timeline: Timeline) => void;
}

// Autosave (debounced)
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave(projectId: ID, timeline: Timeline) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    getEditorAdapter().saveTimeline(projectId, timeline).catch((e) => {
      console.error("[editor] autosave failed", e);
    });
  }, 300);
}

export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => ({
      projectId: null,
      bundle: null,
      timeline: null,

      loading: false,
      error: null,
      leftPanel: "media",
      selectedClipIds: [],
      selectedSceneId: null,
      tool: "select",
      zoom: 80, // 80 px/sec default
      scrollX: 0,

      playing: false,
      currentTime: 0,
      loop: false,
      muted: false,
      volume: 1,

      loadProject: async (projectId) => {
        set({ loading: true, error: null, projectId });
        try {
          const bundle = await getEditorAdapter().loadProjectBundle(projectId);
          const timeline = buildTimelineFromProjectBundle(bundle);
          set({ bundle, timeline, loading: false, currentTime: 0 });
        } catch (e) {
          set({ loading: false, error: (e as Error).message });
        }
      },

      rebuildTimelineFromBundle: () => {
        const { bundle } = get();
        if (!bundle) return;
        set({ timeline: buildTimelineFromProjectBundle(bundle) });
      },

      addMediaToBundle: (asset) => {
        const { bundle } = get();
        if (!bundle) return;
        // Prevent duplicates
        if (bundle.mediaAssets.some((m) => m.id === asset.id)) return;
        const newBundle = {
          ...bundle,
          mediaAssets: [...bundle.mediaAssets, asset],
        };
        set({ bundle: newBundle });
      },

      setSelectedClips: (ids) => set({ selectedClipIds: ids }),
      toggleClipSelection: (id, additive) =>
        set((s) => {
          if (!additive) return { selectedClipIds: [id] };
          const has = s.selectedClipIds.includes(id);
          return {
            selectedClipIds: has
              ? s.selectedClipIds.filter((x) => x !== id)
              : [...s.selectedClipIds, id],
          };
        }),
      clearSelection: () => set({ selectedClipIds: [], selectedSceneId: null }),
      setSelectedScene: (id) => set({ selectedSceneId: id }),

      setLeftPanel: (p) => set({ leftPanel: p }),
      setTool: (t) => set({ tool: t }),
      setZoom: (z) => set({ zoom: Math.max(10, Math.min(400, z)) }),
      setScrollX: (x) => set({ scrollX: Math.max(0, x) }),

      play: () => set({ playing: true }),
      pause: () => set({ playing: false }),
      togglePlay: () => set((s) => ({ playing: !s.playing })),
      seek: (t) => {
        const tl = get().timeline;
        const max = tl?.duration ?? 0;
        set({ currentTime: Math.max(0, Math.min(t, max)) });
      },
      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
      setMuted: (m) => set({ muted: m }),

      updateClip: (id, patch) =>
        mutateTimeline(set, get, (tl) => {
          const i = tl.clips.findIndex((c) => c.id === id);
          if (i >= 0) {
            const existing = tl.clips[i];
            // Deep merge for nested objects like style and filter
            const merged: Record<string, unknown> = { ...existing };
            for (const [key, value] of Object.entries(patch)) {
              if (
                value !== null &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                key in existing &&
                typeof (existing as Record<string, unknown>)[key] === "object" &&
                (existing as Record<string, unknown>)[key] !== null
              ) {
                merged[key] = { ...(existing as Record<string, unknown>)[key] as object, ...value as object };
              } else {
                merged[key] = value;
              }
            }
            tl.clips[i] = merged as Clip;
          }
        }),

      moveClip: (id, delta) =>
        mutateTimeline(set, get, (tl) => {
          const c = tl.clips.find((x) => x.id === id);
          if (!c || c.locked) return;
          c.start = Math.max(0, c.start + delta);
        }),

      resizeClip: (id, edge, delta) =>
        mutateTimeline(set, get, (tl) => {
          const c = tl.clips.find((x) => x.id === id);
          if (!c || c.locked) return;
          if (edge === "left") {
            const newStart = Math.max(0, c.start + delta);
            const realDelta = newStart - c.start;
            c.start = newStart;
            c.duration = Math.max(0.05, c.duration - realDelta);
            if ("inPoint" in c) c.inPoint = Math.max(0, (c.inPoint ?? 0) + realDelta);
          } else {
            c.duration = Math.max(0.05, c.duration + delta);
          }
        }),

      splitClipAt: (id, time) =>
        mutateTimeline(set, get, (tl) => {
          const c = tl.clips.find((x) => x.id === id);
          if (!c) return;
          if (time <= c.start || time >= c.start + c.duration) return;
          const offset = time - c.start;
          const right: Clip = JSON.parse(JSON.stringify(c));
          right.id = `clip_${nanoid(8)}`;
          right.start = time;
          right.duration = c.duration - offset;
          if ("inPoint" in right) right.inPoint = (right.inPoint ?? 0) + offset;
          c.duration = offset;
          tl.clips.push(right);
        }),

      deleteClips: (ids) =>
        mutateTimeline(set, get, (tl) => {
          tl.clips = tl.clips.filter((c) => !ids.includes(c.id));
        }),

      duplicateClips: (ids) =>
        mutateTimeline(set, get, (tl) => {
          ids.forEach((id) => {
            const c = tl.clips.find((x) => x.id === id);
            if (!c) return;
            const copy: Clip = JSON.parse(JSON.stringify(c));
            copy.id = `clip_${nanoid(8)}`;
            copy.start = c.start + c.duration;
            tl.clips.push(copy);
          });
        }),

      addClip: (clip) =>
        mutateTimeline(set, get, (tl) => {
          tl.clips.push(clip);
          tl.duration = Math.max(tl.duration, clip.start + clip.duration);
        }),

      reorderClipToTrack: (id, trackId) =>
        mutateTimeline(set, get, (tl) => {
          const c = tl.clips.find((x) => x.id === id);
          if (c) c.trackId = trackId;
        }),

      updateTimelineSettings: (patch) =>
        mutateTimeline(set, get, (tl) => {
          if (patch.width !== undefined) tl.width = patch.width;
          if (patch.height !== undefined) tl.height = patch.height;
          if (patch.fps !== undefined) tl.fps = patch.fps;
        }),

      toggleTrackLock: (id) =>
        mutateTimeline(set, get, (tl) => {
          const t = tl.tracks.find((x) => x.id === id);
          if (t) t.locked = !t.locked;
        }),
      toggleTrackHidden: (id) =>
        mutateTimeline(set, get, (tl) => {
          const t = tl.tracks.find((x) => x.id === id);
          if (t) t.hidden = !t.hidden;
        }),
      toggleTrackMuted: (id) =>
        mutateTimeline(set, get, (tl) => {
          const t = tl.tracks.find((x) => x.id === id);
          if (t) t.muted = !t.muted;
        }),

      addScene: () =>
        mutateTimeline(set, get, (tl) => {
          const last = tl.scenes[tl.scenes.length - 1];
          const start = last ? last.start + last.duration : 0;
          tl.scenes.push({
            id: `scene_${nanoid(6)}`,
            title: `Scene ${tl.scenes.length + 1}`,
            start,
            duration: 3,
          });
        }),
      deleteScene: (id) =>
        mutateTimeline(set, get, (tl) => {
          tl.scenes = tl.scenes.filter((s) => s.id !== id);
        }),
      duplicateScene: (id) =>
        mutateTimeline(set, get, (tl) => {
          const s = tl.scenes.find((x) => x.id === id);
          if (!s) return;
          tl.scenes.push({
            ...s,
            id: `scene_${nanoid(6)}`,
            start: s.start + s.duration,
            title: `${s.title} copy`,
          });
        }),
      reorderScenes: (order) =>
        mutateTimeline(set, get, (tl) => {
          const map = new Map(tl.scenes.map((s) => [s.id, s] as const));
          tl.scenes = order
            .map((id) => map.get(id))
            .filter((s): s is Scene => Boolean(s));
        }),
      updateScene: (id, patch) =>
        mutateTimeline(set, get, (tl) => {
          const i = tl.scenes.findIndex((s) => s.id === id);
          if (i >= 0) tl.scenes[i] = { ...tl.scenes[i], ...patch };
        }),

      addKeyframe: (clipId, prop, t, v) =>
        mutateTimeline(set, get, (tl) => {
          const c = tl.clips.find((x) => x.id === clipId);
          if (!c) return;
          const arr = c.keyframes[prop];
          const existingIdx = arr.findIndex((k) => Math.abs(k.t - t) < 0.001);
          if (existingIdx >= 0) arr[existingIdx].v = v;
          else arr.push({ t, v, ease: "linear" });
          arr.sort((a, b) => a.t - b.t);
        }),
      removeKeyframe: (clipId, prop, t) =>
        mutateTimeline(set, get, (tl) => {
          const c = tl.clips.find((x) => x.id === clipId);
          if (!c) return;
          c.keyframes[prop] = c.keyframes[prop].filter(
            (k) => Math.abs(k.t - t) > 0.001,
          );
        }),

      exportTimelineJson: () => {
        const tl = get().timeline;
        if (!tl) throw new Error("No timeline");
        return JSON.stringify(tl, null, 2);
      },
      importTimeline: (timeline) => set({ timeline }),
    }),
    {
      limit: 100,
      // Track only timeline data in history — not transient UI/playback state
      partialize: (state) => ({ timeline: state.timeline }) as never,
      equality: (a, b) => a === b,
    },
  ),
);

function mutateTimeline(
  set: (partial: Partial<EditorState>) => void,
  get: () => EditorState,
  recipe: (tl: Timeline) => void,
) {
  const current = get().timeline;
  if (!current) return;
  const next = produce(current, recipe);
  if (next === current) return;
  // Recompute duration as the max of all clip ends + voiceover length
  const maxEnd = next.clips.reduce(
    (m, c) => Math.max(m, c.start + c.duration),
    next.duration,
  );
  const finalTl = { ...next, duration: maxEnd };
  set({ timeline: finalTl });
  const pid = get().projectId;
  if (pid) scheduleAutosave(pid, finalTl);
}

// Selectors
export const selectTrackClips = (trackId: string) => (s: EditorState) =>
  s.timeline?.clips.filter((c) => c.trackId === trackId) ?? [];
export const selectSelectedClip = (s: EditorState) =>
  s.timeline?.clips.find((c) => s.selectedClipIds[0] === c.id) ?? null;

// Undo/Redo accessors (zundo attaches `.temporal` to the store)
type TemporalState = {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  pastStates: unknown[];
  futureStates: unknown[];
};
const temporalStore = (useEditorStore as unknown as {
  temporal: { getState: () => TemporalState; subscribe: (l: () => void) => () => void };
}).temporal;

export const editorHistory = {
  undo: () => temporalStore.getState().undo(),
  redo: () => temporalStore.getState().redo(),
  canUndo: () => temporalStore.getState().pastStates.length > 0,
  canRedo: () => temporalStore.getState().futureStates.length > 0,
  subscribe: (l: () => void) => temporalStore.subscribe(l),
};
