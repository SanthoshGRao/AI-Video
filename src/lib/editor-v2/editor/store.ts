/**
 * Phase 0 — Slice-based editor core store.
 *
 * Holds the time-based ProjectSec, the playhead, selection, and routes all
 * mutations through commands so history works via inverse ops (not snapshots).
 *
 * The legacy `editor-store.ts` facade re-exports a px-shaped view of `clips`
 * on top of this store. UI code does not change.
 */

import { create } from "zustand";
import {
  AddClipCmd,
  AddTrackCmd,
  BatchCmd,
  MergeSplitCmd,
  MoveClipCmd,
  RemoveClipCmd,
  RemoveTrackCmd,
  SplitClipCmd,
  TrimClipCmd,
  UpdateClipCmd,
  type Command,
} from "./commands";
import { eventBus } from "./event-bus";
import { history } from "./history";
import { findAvailablePosition } from "./occupancy-engine";
import { runTransaction, type TxResult } from "./transaction";
import {
  DEFAULT_SCENE_ID,
  makeDefaultProject,
  type ClipSec,
  type ProjectSec,
  type Track,
  type TrackKind,
} from "./types";

interface CoreState {
  project: ProjectSec;
  playhead: number; // seconds
  playing: boolean;
  selection: { kind: "clip" | "element" | "transition" | null; id: string | null };
  activeSceneId: string;
  _historyVersion: number;

  /* low-level command runner */
  run: (cmd: Command) => void;
  runBatch: (cmds: Command[]) => void;

  /* high-level mutations */
  addClip: (clip: Omit<ClipSec, "id" | "sceneId">) => string;
  updateClip: (id: string, patch: Partial<ClipSec>) => void;
  removeClip: (id: string) => void;
  moveClip: (id: string, startTime: number, trackId?: number) => void;
  trimClip: (id: string, startTime: number, endTime: number, mediaIn?: number) => void;
  splitClipAt: (id: string, time: number) => string | null;
  duplicateClip: (id: string) => string | null;

  addTrack: (kind: TrackKind, label?: string) => number;
  removeTrack: (id: number) => void;

  /* selection / playhead / play */
  setSelection: (kind: CoreState["selection"]["kind"], id: string | null) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;

  /* scene */
  setActiveScene: (sceneId: string) => void;

  /* history */
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  /* project hydration */
  loadProject: (p: ProjectSec) => void;
  replaceClips: (clips: ClipSec[]) => void;
}

const uid = (p = "id") =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Transaction telemetry — surfaced in the Debug HUD. */
export const txStats = {
  committed: 0,
  rejected: 0,
  lastReason: "" as string,
};

export const useEditorCore = create<CoreState>((set, get) => ({
  project: makeDefaultProject(),
  playhead: 0,
  playing: false,
  selection: { kind: null, id: null },
  activeSceneId: DEFAULT_SCENE_ID,
  _historyVersion: 0,

  run: (cmd) => {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const tx: TxResult = runTransaction(history, get().project, cmd);
    if (!tx.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[tx] rejected ${cmd.type} @ ${tx.stage}: ${tx.reason}`);
      txStats.rejected++;
      txStats.lastReason = `${cmd.type}: ${tx.reason ?? ""}`;
      return;
    }
    txStats.committed++;
    set((s) => ({ project: tx.project, _historyVersion: s._historyVersion + 1 }));
    eventBus.emit("HISTORY_CHANGED", { canUndo: history.canUndo(), canRedo: history.canRedo() });
    // Telemetry — lazy import to avoid a cycle with the UI store.
    if (typeof performance !== "undefined") {
      const ms = performance.now() - t0;
      void import("./timeline-ui-store").then(({ useTimelineUI }) => {
        const inner = (cmd as { type: string; cmds?: { type: string }[] }).cmds;
        if (Array.isArray(inner)) {
          for (const c of inner) useTimelineUI.getState().recordCommand(c.type, ms / inner.length);
        } else {
          useTimelineUI.getState().recordCommand(cmd.type, ms);
        }
      });
    }
  },

  runBatch: (cmds) => {
    if (!cmds.length) return;
    get().run(new BatchCmd(cmds));
  },

  addClip: (clip) => {
    const id = uid("clip");
    const full: ClipSec = {
      sceneId: get().activeSceneId,
      ...clip,
      id,
    };
    get().run(new AddClipCmd(full));
    eventBus.emit("CLIP_ADDED", { clipId: id });
    return id;
  },

  updateClip: (id, patch) => {
    get().run(new UpdateClipCmd(id, patch));
    eventBus.emit("CLIP_UPDATED", { clipId: id });
  },

  removeClip: (id) => {
    get().run(new RemoveClipCmd(id));
    if (get().selection.id === id) set({ selection: { kind: null, id: null } });
    eventBus.emit("CLIP_REMOVED", { clipId: id });
  },

  moveClip: (id, startTime, trackId) => {
    const c = get().project.clips.find((x) => x.id === id);
    if (!c) return;
    get().run(new MoveClipCmd(id, Math.max(0, startTime), trackId ?? c.trackId));
    eventBus.emit("CLIP_MOVED", { clipId: id, trackId: trackId ?? c.trackId, startTime });
  },

  trimClip: (id, startTime, endTime, mediaIn) => {
    get().run(new TrimClipCmd(id, Math.max(0, startTime), Math.max(startTime + 0.05, endTime), mediaIn));
    eventBus.emit("CLIP_TRIMMED", { clipId: id });
  },

  splitClipAt: (id, time) => {
    const c = get().project.clips.find((x) => x.id === id);
    if (!c) return null;
    if (time <= c.startTime + 0.05 || time >= c.endTime - 0.05) return null;
    const newId = uid("clip");
    get().run(new SplitClipCmd(id, time, newId));
    eventBus.emit("CLIP_SPLIT", { sourceId: id, newId, at: time });
    return newId;
  },

  duplicateClip: (id) => {
    const c = get().project.clips.find((x) => x.id === id);
    if (!c) return null;
    const dur = c.endTime - c.startTime;
    const newId = uid("clip");
    const startTime = findAvailablePosition(
      get().project,
      c.sceneId,
      c.trackId,
      dur,
      c.endTime
    );
    const copy: ClipSec = { ...c, id: newId, startTime, endTime: startTime + dur };
    get().run(new AddClipCmd(copy));
    eventBus.emit("CLIP_ADDED", { clipId: newId });
    return newId;
  },

  addTrack: (kind, label) => {
    const id = (get().project.tracks.reduce((m, t) => Math.max(m, t.id), 0) || 0) + 1;
    const trackLabel = label ?? `${kind.charAt(0).toUpperCase() + kind.slice(1)} ${id}`;
    const t: Track = { id, kind, label: trackLabel };
    get().run(new AddTrackCmd(t));
    eventBus.emit("TRACK_ADDED", { trackId: id });
    return id;
  },

  removeTrack: (id) => {
    get().run(new RemoveTrackCmd(id));
    eventBus.emit("TRACK_REMOVED", { trackId: id });
  },

  setSelection: (kind, id) => {
    set({ selection: { kind, id } });
    eventBus.emit("SELECTION_CHANGED", { kind, id });
  },

  setPlayhead: (t) => {
    const time = Math.max(0, t);
    set({ playhead: time });
    eventBus.emit("PLAYHEAD_MOVED", { time });
  },

  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (playing) => set({ playing }),

  setActiveScene: (sceneId) => {
    set({ activeSceneId: sceneId });
    eventBus.emit("SCENE_CHANGED", { sceneId });
  },

  undo: () => {
    if (!history.canUndo()) return;
    set((s) => ({ project: history.undo(s.project), _historyVersion: s._historyVersion + 1 }));
    eventBus.emit("HISTORY_CHANGED", { canUndo: history.canUndo(), canRedo: history.canRedo() });
    void import("./timeline-ui-store").then(({ useTimelineUI }) =>
      useTimelineUI.getState().recordCommand("Undo", 0),
    );
  },

  redo: () => {
    if (!history.canRedo()) return;
    set((s) => ({ project: history.redo(s.project), _historyVersion: s._historyVersion + 1 }));
    eventBus.emit("HISTORY_CHANGED", { canUndo: history.canUndo(), canRedo: history.canRedo() });
    void import("./timeline-ui-store").then(({ useTimelineUI }) =>
      useTimelineUI.getState().recordCommand("Redo", 0),
    );
  },

  canUndo: () => history.canUndo(),
  canRedo: () => history.canRedo(),

  loadProject: (p) => {
    history.clear();
    set({ project: p, _historyVersion: 0, selection: { kind: null, id: null } });
    eventBus.emit("PROJECT_LOADED", { projectId: p.id });
  },

  replaceClips: (clips) => {
    // Used by the legacy facade for bulk operations during the transition.
    set((s) => ({ project: { ...s.project, clips } }));
  },
}));

// Re-export merge command so callers (e.g. transition smart-merge UI) can build their own.
export { MergeSplitCmd };
