import { create } from "zustand";
import { createId } from "@paralleldrive/cuid2";
import type { NativeClip, NativeProject, NativeTrack } from "../../../src/editor/model/types";
import type { EditorLoadPayload, LoadedAudio, LoadedMedia, LoadedSubtitleTrack } from "../global";

export interface PreviewStats {
  lastRenderMs: number;
  instantFps: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  cachedLayers: number;
}

interface ProjectStoreState {
  projectId: string | null;
  projectTitle: string;
  timeline: NativeProject | null;
  media: LoadedMedia[];
  audio: LoadedAudio[];
  subtitles: LoadedSubtitleTrack[];
  subtitleTrackId: string | null;

  selectedClipId: string | null;
  playheadSec: number;
  isPlaying: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  timelineVersion: number;
  recoveryAvailable: NativeProject | null;
  previewStats: PreviewStats | null;
  setPreviewStats(stats: PreviewStats): void;

  load(projectId: string): Promise<void>;
  save(opts?: { isAutosave?: boolean; bumpVersion?: boolean }): Promise<void>;
  snapshotLocal(): void;
  restoreRecovery(): void;
  dismissRecovery(): void;
  selectClip(id: string | null): void;
  updateClip(id: string, patch: Partial<NativeClip>): void;
  addClipFromMedia(media: LoadedMedia, trackId: string, startSec: number): void;
  setPlayhead(sec: number): void;
  setPlaying(v: boolean): void;
}

function recomputeDuration(project: NativeProject): number {
  return project.clips.reduce((max, c) => Math.max(max, c.endSec), 0);
}

function ensureVideoTrack(project: NativeProject): NativeTrack {
  const existing = project.tracks.find((t) => t.kind === "video");
  if (existing) return existing;
  const track: NativeTrack = {
    id: createId(),
    kind: "video",
    name: "Video 1",
    order: project.tracks.length,
    muted: false,
    locked: false,
    hidden: false,
  };
  project.tracks.push(track);
  return track;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projectId: null,
  projectTitle: "",
  timeline: null,
  media: [],
  audio: [],
  subtitles: [],
  subtitleTrackId: null,

  selectedClipId: null,
  playheadSec: 0,
  isPlaying: false,
  isDirty: false,
  isSaving: false,
  isLoading: false,
  error: null,
  timelineVersion: 0,
  recoveryAvailable: null,
  previewStats: null,

  setPreviewStats(stats) {
    set({ previewStats: stats });
  },

  async load(projectId: string) {
    set({ isLoading: true, error: null });
    try {
      const payload: EditorLoadPayload = await window.editorAPI.load(projectId);
      set({
        projectId,
        projectTitle: payload.project.title,
        timeline: payload.timeline,
        timelineVersion: payload.timeline.version,
        recoveryAvailable: payload.recoverySnapshot,
        media: payload.media,
        audio: payload.audio,
        subtitles: payload.subtitles,
        subtitleTrackId: payload.subtitleTrackId,
        isLoading: false,
        isDirty: false,
      });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  async save(opts) {
    const { projectId, timeline } = get();
    if (!projectId || !timeline) return;
    set({ isSaving: true });
    try {
      const result = await window.editorAPI.save({
        projectId,
        timeline,
        isAutosave: opts?.isAutosave ?? false,
        bumpVersion: opts?.bumpVersion ?? false,
      });
      set({ isSaving: false, isDirty: false, timelineVersion: result.version });
    } catch (err) {
      set({ isSaving: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  /** Cheap local-disk-only crash-recovery snapshot — no DB round trip, safe
   * to call far more often than save() (see App.tsx's interval). */
  snapshotLocal() {
    const { projectId, timeline, timelineVersion, isDirty } = get();
    if (!projectId || !timeline || !isDirty) return;
    window.editorAPI.saveRecoverySnapshot({ projectId, timeline, timelineVersion });
  },

  restoreRecovery() {
    const { recoveryAvailable } = get();
    if (!recoveryAvailable) return;
    set({ timeline: recoveryAvailable, recoveryAvailable: null, isDirty: true });
  },

  dismissRecovery() {
    set({ recoveryAvailable: null });
  },

  selectClip(id) {
    set({ selectedClipId: id });
  },

  updateClip(id, patch) {
    const { timeline } = get();
    if (!timeline) return;
    const clips = timeline.clips.map((c) => (c.id === id ? { ...c, ...patch } : c));
    const next = { ...timeline, clips };
    next.durationSec = recomputeDuration(next);
    set({ timeline: next, isDirty: true });
  },

  addClipFromMedia(media, trackId, startSec) {
    const { timeline } = get();
    if (!timeline) return;
    const track = timeline.tracks.find((t) => t.id === trackId) ?? ensureVideoTrack(timeline);
    const durationSec = media.durationMs ? media.durationMs / 1000 : 3;
    const clip: NativeClip = {
      id: createId(),
      trackId: track.id,
      kind: media.type === "video" ? "video" : "image",
      startSec,
      endSec: startSec + durationSec,
      mediaInSec: 0,
      mediaOutSec: durationSec,
      mediaAssetId: media.id,
      transform: { x: 0, y: 0, w: timeline.width, h: timeline.height, rotationDeg: 0, opacity: 1 },
      fit: "cover",
      effects: [],
    };
    const next: NativeProject = {
      ...timeline,
      tracks: timeline.tracks.some((t) => t.id === track.id) ? timeline.tracks : [...timeline.tracks, track],
      clips: [...timeline.clips, clip],
    };
    next.durationSec = recomputeDuration(next);
    set({ timeline: next, isDirty: true, selectedClipId: clip.id });
  },

  setPlayhead(sec) {
    set({ playheadSec: Math.max(0, sec) });
  },

  setPlaying(v) {
    set({ isPlaying: v });
  },
}));
