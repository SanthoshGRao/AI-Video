"use client";

import { create } from "zustand";
import { editorStateManager } from "@/_designcombo/editor/state-manager";
import { dispatch } from "@designcombo/events";
import { DESIGN_LOAD, TIMELINE_SCALE_CHANGED } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import type {
  IDesign,
  ITrack,
  ITrackItem,
  ITimelineScaleState,
  ITimelineScrollState,
  IVideo,
  IAudio,
  ICaption,
  ISize,
  ITransition,
} from "@designcombo/types";
import type { PlayerRef } from "@remotion/player";
import type Timeline from "@designcombo/timeline";
import type { Moveable } from "@interactify/toolkit";

import { SECONDARY_FONT, SECONDARY_FONT_URL } from "@/_designcombo/editor/constants/constants";
import { elementsToTimelineDocument } from "@/lib/editor/timeline-adapter";
import {
  buildMediaUrlIndex,
  designStateToTimelineDocument,
  type DesigncomboPersistState,
} from "@/lib/editor/designcombo-to-timeline";
import type {
  EditorAspectRatio,
  EditorElement,
  EditorExportFormat,
  EditorExportJob,
  EditorExportResolution,
  EditorTrack,
  ProjectAssetsInput,
  LoadedProjectAssets,
} from "@/lib/editor/types";
import type { SubtitleCue, SubtitleStyle } from "@/lib/subtitles/types";
import type { TimelineDocument } from "@/lib/timeline/types";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const ASPECT_RATIOS: EditorAspectRatio[] = [
  { label: "9:16", width: 1080, height: 1920 },
  { label: "16:9", width: 1920, height: 1080 },
  { label: "1:1", width: 1080, height: 1080 },
];

const DEFAULT_EDITOR_TRACKS: EditorTrack[] = [
  { id: "track-video", type: "video", name: "Video", locked: false, visible: true },
  { id: "track-image", type: "overlay", name: "Image", locked: false, visible: true },
  { id: "track-text", type: "text", name: "Text", locked: false, visible: true },
  { id: "track-subtitle", type: "subtitle", name: "Subtitles", locked: false, visible: true },
  { id: "track-audio", type: "audio", name: "Voiceover", locked: false, visible: true },
  { id: "track-music", type: "audio", name: "Music", locked: false, visible: true },
];

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

function framesToMs(frames: number, fps: number): number {
  return Math.round((frames / fps) * 1000);
}

function genId(): string {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultSubtitleStyle(): SubtitleStyle {
  return {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.55)",
    position: "bottom",
    animation: "none",
    highlightColor: "#fbbf24",
    stroke: true,
    strokeColor: "#000000",
    strokeWidth: 2,
    shadow: true,
  };
}

function makeDesigncomboTrack(type: ITrack["type"], itemIds: string[]): ITrack {
  return {
    id: generateId(),
    type,
    items: itemIds,
    muted: false,
    accepts: ["text", "image", "video", "audio", "caption", "template"],
    magnetic: false,
    static: false,
  };
}

function captionTop(canvasH: number, position: SubtitleStyle["position"]): string {
  if (position === "top") return `${Math.round(canvasH * 0.08)}px`;
  if (position === "center") return `${Math.round(canvasH * 0.42)}px`;
  return `${Math.round(canvasH * 0.78)}px`;
}

function cueWordsForCaption(cue: SubtitleCue) {
  if (cue.words?.length) {
    const relStart = cue.startMs;
    return cue.words.map((w) => ({
      word: w.word,
      start: Math.max(0, w.startMs - relStart),
      end: Math.max(0, w.endMs - relStart),
      confidence: 1,
      is_keyword: false,
    }));
  }
  return [];
}

function buildCaptionItem(
  cue: SubtitleCue,
  style: SubtitleStyle,
  canvasW: number,
  canvasH: number,
  id: string,
): ICaption {
  const words = cueWordsForCaption(cue);
  const strokeW = style.stroke ? style.strokeWidth : 0;
  return {
    id,
    name: "caption",
    type: "caption",
    display: { from: cue.startMs, to: cue.endMs },
    details: {
      text: cue.text,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily.split(",")[0]?.trim() ?? SECONDARY_FONT,
      fontUrl: SECONDARY_FONT_URL,
      color: style.color,
      backgroundColor: style.backgroundColor,
      appearedColor: style.color,
      activeColor: style.highlightColor,
      activeFillColor: style.highlightColor,
      animation: style.animation,
      textAlign: "center" as const,
      width: Math.min(canvasW - 80, 800),
      height: style.fontSize + 24,
      top: captionTop(canvasH, style.position),
      left: "40px",
      opacity: 100,
      fontWeight: style.fontWeight,
      fontStyle: "normal",
      textDecoration: "none",
      lineHeight: "normal",
      letterSpacing: "normal",
      wordSpacing: "normal",
      border: "none",
      textShadow: style.shadow ? "2px 2px 4px rgba(0,0,0,0.8)" : "none",
      wordWrap: "normal",
      wordBreak: "normal",
      WebkitTextStrokeColor: style.strokeColor,
      WebkitTextStrokeWidth: `${strokeW}px`,
      borderWidth: strokeW,
      borderColor: style.strokeColor,
      boxShadow: { color: "#000000", x: 0, y: 0, blur: 0 },
      textTransform: "none" as "capitalize",
      transform: "none",
      skewX: 0,
      skewY: 0,
      words,
      linesPerCaption: 1,
      wordsPerLine: "punctuationOrPause",
      isKeywordColor: "transparent",
      preservedColorKeyWord: false,
    },
    metadata: { cueId: cue.id },
    isMain: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Merged state type                                                  */
/* ------------------------------------------------------------------ */

type LoadedMedia = {
  id: string;
  type: string;
  originalName: string;
  r2Url: string;
  thumbnailUrl?: string | null;
};

type DesignMirror = {
  tracks: ITrack[];
  trackItemIds: string[];
  transitionIds: string[];
  transitionsMap: Record<string, ITransition>;
  trackItemsMap: Record<string, ITrackItem>;
  structure: import("@designcombo/types").ItemStructure[];
  activeIds: string[];
};

type EditorStoreState = {
  /* -- Shared state (mirrored from StateManager) -- */
  duration: number;
  fps: number;
  scale: ITimelineScaleState;
  scroll: ITimelineScrollState;
  size: ISize;
  background: { type: "color" | "image"; value: string };
  compositions: Partial<import("@designcombo/types").IComposition>[];

  /* -- Full DesignCombo mirror (read via `design` key) -- */
  design: DesignMirror;

  /* -- UI-only state — not persisted to StateManager -- */
  timeline: Timeline | null;
  playerRef: React.RefObject<PlayerRef> | null;
  sceneMoveableRef: React.RefObject<Moveable> | null;
  viewTimeline: boolean;
  draggedItem: Record<string, unknown> | null;

  /** Current playhead position in milliseconds */
  playheadMs: number;

  /** Whether the player is actively playing */
  isPlaying: boolean;

  /** Total timeline duration in milliseconds (alias for compatibility) */
  durationMs: number;

  selectedLayer: ITrackItem | null;
  zoom: number;

  /* -- Application-level editor state -- */
  projectId: string | null;
  loaded: boolean;
  loading: boolean;
  dirty: boolean;
  saving: boolean;

  elements: EditorElement[];
  media: LoadedMedia[];
  tracks: EditorTrack[];
  subtitleCues: SubtitleCue[];
  subtitleStyle: SubtitleStyle;
  subtitlePresetName: string;
  selectedElementId: string | null;

  /* -- Save state -- */
  saveStatus: "saved" | "unsaved" | "saving" | "error";
  lastSavedAt: number | null;

  volume: number;
  aspectRatio: EditorAspectRatio;
  warnings: string[];
  exportJob: EditorExportJob | null;
  exportBusy: boolean;

  /* -- App-level undo — kept for elements only -- */
  historyPast: EditorElement[][];
  historyFuture: EditorElement[][];

  /* -- StateManager subscriptions guard -- */
  _subscribed: boolean;
};

type EditorStoreActions = {
  /* DesignCombo mirror setters */
  setTimeline: (timeline: Timeline) => void;
  setScale: (scale: ITimelineScaleState) => void;
  setScroll: (scroll: ITimelineScrollState) => void;
  setPlayerRef: (playerRef: React.RefObject<PlayerRef> | null) => void;
  setSceneMoveableRef: (ref: React.RefObject<Moveable>) => void;
  setCompositions: (compositions: Partial<import("@designcombo/types").IComposition>[]) => void;
  setViewTimeline: (view: boolean) => void;
  setDraggedItem: (item: Record<string, unknown> | null) => void;

  /* Playback */
  setPlayhead: (ms: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (ms: number) => void;

  /* Selection */
  setSelectedLayer: (layer: ITrackItem | null) => void;
  selectLayer: (id: string | null) => void;
  selectElement: (id: string | null) => void;

  /* Zoom / Aspect */
  setZoom: (zoomVal: number) => void;
  setVolume: (v: number) => void;
  setAspectRatio: (ar: EditorAspectRatio) => void;

  /* Element CRUD (app-level) */
  addElement: (el: Omit<EditorElement, "id">) => string;
  updateElement: (id: string, patch: Partial<EditorElement>, options?: { skipHistory?: boolean }) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  moveClip: (id: string, startMs: number, endMs: number) => void;
  resizeClip: (id: string, edge: "start" | "end", ms: number) => void;
  splitClipAtPlayhead: () => void;

  /* History (app-level, for elements) */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  /* Project lifecycle */
  hydrate: (input: ProjectAssetsInput) => Promise<void>;
  markDirty: () => void;
  save: (force?: boolean) => Promise<boolean>;
  saveDraft: () => Promise<boolean>;
  saveAsTemplate: () => Promise<boolean>;
  startExport: (config: { resolution: EditorExportResolution; format?: EditorExportFormat; quality?: string }) => Promise<void>;
  pollExport: (jobId: string) => Promise<void>;

  /* Subtitles & Facts */
  updateSubtitleStyle: (style: Partial<SubtitleStyle>, presetName?: string) => void;
  generateKeyFactOverlays: (narrationText: string) => void;
};

/* ------------------------------------------------------------------ */
/*  Init StateManager subscriptions                                    */
/* ------------------------------------------------------------------ */

function subscribeToStateManager(store: typeof useEditorStore): () => void {
  if (store.getState()._subscribed) return () => {};

  const subs: import("rxjs").Subscription[] = [];

  subs.push(
    editorStateManager.subscribe((state: import("@designcombo/types").State) => {
      store.setState({
        design: {
          tracks: state.tracks,
          trackItemIds: state.trackItemIds,
          trackItemsMap: state.trackItemsMap,
          transitionIds: state.transitionIds,
          transitionsMap: state.transitionsMap,
          structure: state.structure,
          activeIds: state.activeIds,
        },
        scale: state.scale,
        duration: state.duration,
        durationMs: state.duration,
        size: state.size,
        fps: state.fps,
        background: state.background,
        zoom: state.scale.zoom,
        selectedLayer:
          state.activeIds.length === 1
            ? (state.trackItemsMap[state.activeIds[0]] ?? null)
            : null,
      });
    }),
  );

  subs.push(
    editorStateManager.subscribeToActiveIds(({ activeIds }: { activeIds: string[] }) => {
      const { design } = store.getState();
      store.setState({
        design: { ...design, activeIds },
        selectedLayer:
          activeIds.length === 1 ? (design.trackItemsMap[activeIds[0]] ?? null) : null,
      });
    }),
  );

  subs.push(
    editorStateManager.subscribeToDuration(({ duration }: { duration: number }) => {
      store.setState({ duration });
    }),
  );

  subs.push(
    editorStateManager.subscribeToScale(({ scale }: { scale: ITimelineScaleState }) => {
      store.setState({ scale, zoom: scale.unit });
    }),
  );

  subs.push(
    editorStateManager.subscribeToFps(({ fps }: { fps: number }) => {
      store.setState({ fps });
    }),
  );

  subs.push(
    editorStateManager.subscribeToUpdateTracks(
      ({ tracks, duration, trackItemsMap }: { tracks: ITrack[]; duration: number; trackItemsMap: Record<string, ITrackItem> }) => {
        const { design } = store.getState();
        store.setState({
          design: { ...design, tracks, trackItemsMap },
          duration,
        });
      },
    ),
  );

  subs.push(
    editorStateManager.subscribeToAddOrRemoveItems(
      ({ trackItemIds }: { trackItemIds: string[] }) => {
        const { design } = store.getState();
        store.setState({ design: { ...design, trackItemIds } });
      },
    ),
  );

  store.setState({ _subscribed: true });

  return () => {
    subs.forEach((s) => s.unsubscribe());
    store.setState({ _subscribed: false });
  };
}

/* ------------------------------------------------------------------ */
/*  Zustand store                                                      */
/* ------------------------------------------------------------------ */

const DEFAULT_SCALE: ITimelineScaleState = {
  index: 7,
  unit: 60,
  zoom: 1 / 60,
  segments: 5,
};

const initialState: EditorStoreState = {
  /* Shared (mirrored from StateManager) */
  duration: 1000,
  fps: 30,
  scale: DEFAULT_SCALE,
  scroll: { left: 0, top: 0 },
  size: { width: 1080, height: 1920 },
  background: { type: "color", value: "#000000" },
  compositions: [],
  design: {
    tracks: [],
    trackItemIds: [],
    transitionIds: [],
    transitionsMap: {},
    trackItemsMap: {},
    structure: [],
    activeIds: [],
  },
  timeline: null,
  playerRef: null,
  sceneMoveableRef: null,
  viewTimeline: true,
  draggedItem: null,
  playheadMs: 0,
  isPlaying: false,
  durationMs: 1000,
  selectedLayer: null,
  zoom: 60,

  /* App-level */
  projectId: null,
  loaded: false,
  loading: false,
  dirty: false,
  saving: false,
  elements: [],
  media: [],
  tracks: DEFAULT_EDITOR_TRACKS,
  subtitleCues: [],
  subtitleStyle: defaultSubtitleStyle(),
  subtitlePresetName: "instagram_reels",
  selectedElementId: null,
  saveStatus: "saved",
  lastSavedAt: null,
  volume: 1,
  aspectRatio: ASPECT_RATIOS[0],
  warnings: [],
  exportJob: null,
  exportBusy: false,
  historyPast: [],
  historyFuture: [],

  _subscribed: false,
};

export const useEditorStore = create<EditorStoreState & EditorStoreActions>(
  (set, get) => {
    /* Subscribe once on store creation */
    setTimeout(() => subscribeToStateManager(useEditorStore), 0);

    return {
      ...initialState,

      /* ========== DesignCombo mirror setters ========== */

      setTimeline: (timeline) => set({ timeline }),

      setScale: (scale) => {
        dispatch(TIMELINE_SCALE_CHANGED, { payload: { scale } });
        set({ scale, zoom: scale.zoom });
      },

      setScroll: (scroll) => set({ scroll }),

      setPlayerRef: (playerRef) => set({ playerRef }),

      setSceneMoveableRef: (ref) => set({ sceneMoveableRef: ref }),

      setCompositions: (compositions) => set({ compositions }),

      setViewTimeline: (viewTimeline) => set({ viewTimeline }),

      setDraggedItem: (item) => set({ draggedItem: item }),

      /* ========== Playback ========== */

      setPlayhead: (timeMs) => {
        const { playerRef, fps, duration } = get();
        const clamped = Math.max(0, Math.min(timeMs, duration));
        if (playerRef?.current) {
          const targetFrame = msToFrames(clamped, fps);
          const currentFrame = playerRef.current.getCurrentFrame();
          if (Math.round(currentFrame) !== targetFrame) {
            playerRef.current.seekTo(targetFrame);
          }
        }
        set({ playheadMs: clamped });
      },

      play: () => {
        const { playerRef } = get();
        if (playerRef?.current && !playerRef.current.isPlaying()) {
          playerRef.current.play();
        }
        set({ isPlaying: true });
      },

      pause: () => {
        const { playerRef } = get();
        if (playerRef?.current && playerRef.current.isPlaying()) {
          playerRef.current.pause();
        }
        set({ isPlaying: false });
      },

      togglePlay: () => {
        const s = get();
        if (s.isPlaying) {
          s.pause();
        } else {
          s.play();
        }
      },

      seek: (ms) => {
        get().setPlayhead(ms);
      },

      /* ========== Selection ========== */

      setSelectedLayer: (layer) => {
        const activeIds = layer ? [layer.id] : [];
        setTimeout(() => {
          dispatch("layer:selection", { payload: { activeIds } });
        }, 0);
        set((s) => ({
          selectedLayer: layer,
          design: { ...s.design, activeIds },
        }));
      },

      selectLayer: (id) => {
        const { design } = get();
        const layer = id ? (design.trackItemsMap[id] ?? null) : null;
        get().setSelectedLayer(layer);
      },

      selectElement: (id) => {
        set({ selectedElementId: id, selectedLayer: null });
        if (!id) {
          setTimeout(() => {
            dispatch("layer:selection", { payload: { activeIds: [] } });
          }, 0);
        }
      },

      /* ========== Zoom / Aspect ========== */

      setZoom: (zoomVal) => {
        const { scale } = get();
        const newScale = { ...scale, zoom: 1 / zoomVal, unit: zoomVal };
        setTimeout(() => {
          dispatch(TIMELINE_SCALE_CHANGED, { payload: { scale: newScale } });
        }, 0);
        set({ scale: newScale, zoom: zoomVal });
      },

      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),

      setAspectRatio: (ar) => set({ aspectRatio: ar, dirty: true }),

      /* ========== Element CRUD ========== */

      addElement(el) {
        get().pushHistory();
        const id = genId();
        set((s) => ({
          elements: [...s.elements, { ...el, id }],
          selectedElementId: id,
          dirty: true,
          saveStatus: "unsaved",
        }));
        return id;
      },

      updateElement(id, patch, options) {
        if (!options?.skipHistory) get().pushHistory();
        set((s) => ({
          elements: s.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
          dirty: true,
          saveStatus: "unsaved",
        }));
      },

      removeElement(id) {
        get().pushHistory();
        set((s) => ({
          elements: s.elements.filter((e) => e.id !== id),
          selectedElementId: s.selectedElementId === id ? null : s.selectedElementId,
          dirty: true,
          saveStatus: "unsaved",
        }));
      },

      duplicateElement(id) {
        const el = get().elements.find((e) => e.id === id);
        if (!el) return;
        const { id: _omit, ...rest } = el;
        const dur = rest.endMs - rest.startMs;
        get().addElement({
          ...rest,
          startMs: rest.endMs,
          endMs: rest.endMs + dur,
          locked: false,
        });
      },

      moveClip(id, startMs, endMs) {
        const dur = endMs - startMs;
        if (dur < 200) return;
        set((s) => ({
          elements: s.elements.map((e) =>
            e.id === id ? { ...e, startMs: Math.max(0, startMs), endMs } : e,
          ),
          dirty: true,
        }));
      },

      resizeClip(id, edge, ms) {
        const el = get().elements.find((e) => e.id === id);
        if (!el) return;
        if (edge === "start") {
          const endMs = Math.max(el.endMs, ms + 200);
          get().moveClip(id, Math.min(ms, el.endMs - 200), endMs);
        } else {
          get().moveClip(id, el.startMs, Math.max(ms, el.startMs + 200));
        }
      },

      splitClipAtPlayhead() {
        const { playheadMs, selectedLayer, elements } = get();
        const ms = playheadMs;
        const el = elements.find((e) => e.id === selectedLayer?.id);
        if (!el || ms <= el.startMs + 100 || ms >= el.endMs - 100) return;
        get().pushHistory();
        const secondId = genId();
        set((s) => ({
          elements: [
            ...s.elements.filter((e) => e.id !== el.id),
            { ...el, endMs: ms },
            { ...el, id: secondId, startMs: ms },
          ],
          dirty: true,
        }));
      },

      /* ========== History ========== */

      pushHistory() {
        set((s) => ({
          historyPast: [...s.historyPast.slice(-30), structuredClone(s.elements)],
          historyFuture: [],
        }));
      },

      undo() {
        const { historyPast, elements } = get();
        if (historyPast.length === 0) return;
        const prev = historyPast[historyPast.length - 1];
        set({
          historyPast: historyPast.slice(0, -1),
          historyFuture: [structuredClone(elements), ...get().historyFuture],
          elements: prev,
          dirty: true,
        });
      },

      redo() {
        const { historyFuture, elements } = get();
        if (historyFuture.length === 0) return;
        const next = historyFuture[0];
        set({
          historyFuture: historyFuture.slice(1),
          historyPast: [...get().historyPast, structuredClone(elements)],
          elements: next,
          dirty: true,
        });
      },

      /* ========== Project lifecycle ========== */

      async hydrate(input) {
        set({ loading: true, projectId: input.projectId });
        try {
          const { loadProjectAssets } = await import("@/lib/editor/load-project-assets");
          const data = await loadProjectAssets(input);
          const nextElements = [...data.elements];
          const hasAutoFacts = nextElements.some((el) => el.textOverlayMeta?.isAutoGenerated);

          if (!hasAutoFacts && data.subtitleCues.length > 0) {
            const { extractKeyFacts } = await import("@/lib/editor/key-fact-extractor");
            const narrationText = data.subtitleCues.map((cue) => cue.text).join(" ");
            const canvasW = data.timeline?.settings.width ?? ASPECT_RATIOS[0].width;
            const facts = extractKeyFacts(narrationText, data.subtitleCues);
            nextElements.push(
              ...facts.map((fact, index): EditorElement => ({
                id: `auto-${fact.id}`,
                type: "text",
                trackIndex: 2,
                startMs: fact.startMs,
                endMs: fact.endMs,
                text: fact.text,
                style: {
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: 48,
                  fontWeight: 900,
                  color: "#ffffff",
                  backgroundColor: "rgba(0,0,0,0.45)",
                  textShadow: "0 4px 16px rgba(0,0,0,0.65)",
                },
                position: { x: Math.max(60, (canvasW - 820) / 2), y: 140 + (index % 3) * 110 },
                size: { width: 820, height: 92 },
                opacity: 1,
                animation: { entrance: "fade_in", exit: "fade_out" },
                textOverlayMeta: {
                  category: fact.category,
                  isAutoGenerated: true,
                },
                visible: true,
                locked: false,
              })),
            );
          }

          const loadedAspect = data.timeline?.settings
            ? ASPECT_RATIOS.find((ar) => ar.label === data.timeline?.settings.aspectRatio) ?? ASPECT_RATIOS[0]
            : ASPECT_RATIOS[0];

          const timelinePreset = data.timeline?.settings?.subtitlePresetName;
          const loadedPreset = timelinePreset === "karaoke" && data.subtitlePresetName !== "karaoke"
            ? data.subtitlePresetName
            : timelinePreset ?? data.subtitlePresetName ?? "instagram_reels";

          set({
            loaded: true,
            loading: false,
            dirty: false,
            saveStatus: "saved",
            elements: nextElements,
            media: data.media,
            subtitleCues: data.subtitleCues,
            subtitleStyle: data.subtitleStyle,
            subtitlePresetName: loadedPreset,
            aspectRatio: loadedAspect,
            warnings: data.warnings,
            historyPast: [],
            historyFuture: [],
          });

          if (data.timeline) {
            editorStateManager.updateState(
              {
                size: data.timeline.settings,
                fps: data.timeline.settings.fps,
                duration: data.durationMs,
              },
              { updateHistory: false },
            );

            const { projectAssetsToDesign } = await import(
              "@/lib/editor/designcombo-adapter"
            );
            const nextDesign = projectAssetsToDesign({
              projectId: input.projectId,
              loaded: { ...data, elements: nextElements },
              aspect: {
                width: data.timeline.settings.width,
                height: data.timeline.settings.height,
              },
            });

            dispatch(DESIGN_LOAD, { payload: nextDesign });
            set({
              size: nextDesign.size,
              fps: nextDesign.fps,
              duration: nextDesign.duration ?? data.durationMs,
            });
          }

          set({ playheadMs: 0, isPlaying: false });
        } catch {
          set({ loading: false, loaded: false, warnings: ["Failed to load editor assets"] });
        }
      },

      markDirty() {
        set({ dirty: true });
      },

      async save(force = false) {
        const { projectId, elements, aspectRatio, dirty, design, media } = get();
        if (!projectId) return false;
        if (!dirty && !force) return true;

        const durationMs = Math.max(
          ...elements.map((e) => e.endMs),
          get().duration,
          1000,
        );

        set({ saving: true, saveStatus: "saving" });
        try {
          const hasDesignState = design.trackItemIds.length > 0 && Object.keys(design.trackItemsMap).length > 0;
          const doc = hasDesignState
            ? designStateToTimelineDocument(
                {
                  tracks: design.tracks,
                  trackItemIds: design.trackItemIds,
                  trackItemsMap: design.trackItemsMap,
                  transitionIds: design.transitionIds,
                  transitionsMap: design.transitionsMap,
                  size: get().size,
                  duration: get().duration,
                  fps: get().fps,
                } satisfies DesigncomboPersistState,
                buildMediaUrlIndex(media)
              )
            : elementsToTimelineDocument(elements, durationMs, aspectRatio);
          doc.settings.aspectRatio = aspectRatio.label;
          doc.settings.width = aspectRatio.width;
          doc.settings.height = aspectRatio.height;
          
          // Save subtitle preset in timeline settings as a simple way to persist it
          const settings = doc.settings as TimelineDocument["settings"] & {
            subtitleStyle?: SubtitleStyle;
          };
          settings.subtitlePresetName = get().subtitlePresetName;
          settings.subtitleStyle = get().subtitleStyle;

          const res = await fetch(`/api/projects/${projectId}/timeline`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...doc, isAutosave: false }),
          });
          if (!res.ok) {
            const json = await res.json();
            throw new Error(json.error || "Save failed");
          }

          // Also save subtitle styles to the subtitle track if we have cues
          if (get().subtitleCues.length > 0) {
            const { saveProjectSubtitles } = await import("@/lib/editor/subtitle-persist");
            await saveProjectSubtitles(projectId, get().subtitleCues, get().subtitleStyle, get().subtitlePresetName);
          }

          set({ dirty: false, saving: false, saveStatus: "saved", lastSavedAt: Date.now() });
          return true;
        } catch {
          set({ saving: false, saveStatus: "error" });
          return false;
        }
      },

      async saveDraft() {
        return get().save(true);
      },

      async saveAsTemplate() {
        return get().save(true);
      },

      async startExport(config) {
        const { projectId } = get();
        if (!projectId) return;
        await get().save();
        set({ exportBusy: true, exportJob: null });
        try {
          const res = await fetch(`/api/projects/${projectId}/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              resolution: config.resolution, 
              subtitleBurnIn: true,
              format: config.format ?? "mp4",
              quality: config.quality ?? "high"
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Export failed");
          set({
            exportJob: {
              id: json.job.id,
              status: json.job.status,
              renderProgress: json.job.renderProgress ?? 0,
              downloadUrl: json.job.downloadUrl ?? null,
              errorMessage: null,
            },
          });
          void get().pollExport(json.job.id);
        } catch (e) {
          set({
            exportBusy: false,
            exportJob: {
              id: "error",
              status: "FAILED",
              renderProgress: 0,
              downloadUrl: null,
              errorMessage: e instanceof Error ? e.message : "Export failed",
            },
          });
        }
      },

      async pollExport(jobId) {
        const { projectId } = get();
        if (!projectId) return;
        const poll = async () => {
          const res = await fetch(`/api/projects/${projectId}/export/${jobId}`);
          if (!res.ok) return;
          const json = await res.json();
          const job = json.job as EditorExportJob;
          set({ exportJob: job });
          if (job.status === "DONE" || job.status === "FAILED") {
            set({ exportBusy: false });
            return;
          }
          setTimeout(poll, 1500);
        };
        await poll();
      },

      /* ========== Subtitles & Facts ========== */

      updateSubtitleStyle(stylePatch, presetName) {
        const { subtitleCues, subtitleStyle } = get();
        const newStyle = { ...subtitleStyle, ...stylePatch };
        
        set({ 
          subtitleStyle: newStyle, 
          dirty: true, 
          saveStatus: "unsaved",
          ...(presetName ? { subtitlePresetName: presetName } : {})
        });

        // Rebuild DesignCombo caption items if we have cues
        if (subtitleCues.length > 0) {
          const sm = editorStateManager;
          const current = sm.getState();
          const canvasW = current.size.width;
          const canvasH = current.size.height;

          // Find the existing master caption
          const masterId = "sub-master";
          if (current.trackItemsMap[masterId]) {
            // It's a master caption
            const combinedText = subtitleCues.map(c => c.text).join(" ");
            const combinedWords = [];
            const startMs = subtitleCues[0].startMs;
            
            for (const cue of subtitleCues) {
              const relStart = cue.startMs;
              if (cue.words) {
                for (const w of cue.words) {
                  combinedWords.push({
                    word: w.word,
                    startMs: startMs + Math.max(0, cue.startMs - startMs + w.startMs - relStart),
                    endMs: startMs + Math.max(0, cue.startMs - startMs + w.endMs - relStart),
                  });
                }
              }
            }

            const masterCue: SubtitleCue = {
              id: "master",
              startMs,
              endMs: subtitleCues[subtitleCues.length - 1].endMs,
              text: combinedText,
              words: combinedWords,
            };

            const newItem = buildCaptionItem(masterCue, newStyle, canvasW, canvasH, masterId);
            sm.updateState({
              trackItemsMap: { ...current.trackItemsMap, [masterId]: newItem }
            });
          }
        }
      },

      async generateKeyFactOverlays(narrationText) {
        const { subtitleCues, elements } = get();
        if (subtitleCues.length === 0 || !narrationText) return;

        const { extractKeyFacts } = await import("@/lib/editor/key-fact-extractor");
        const facts = extractKeyFacts(narrationText, subtitleCues);

        if (facts.length === 0) return;

        // Remove any existing auto-generated facts
        const existingIds = elements.filter(e => e.textOverlayMeta?.isAutoGenerated).map(e => e.id);
        const filteredElements = elements.filter(e => !existingIds.includes(e.id));

        const newElements: EditorElement[] = facts.map(fact => ({
          id: genId(),
          type: "text",
          trackIndex: 2, // Text track
          startMs: fact.startMs,
          endMs: fact.endMs,
          text: fact.text,
          style: {
            fontFamily: "Inter, sans-serif",
            fontSize: 48,
            fontWeight: 800,
            color: "#ffffff",
            backgroundColor: "transparent",
          },
          position: { x: 0, y: 150 }, // Top centerish
          size: { width: 800, height: 100 },
          animation: {
            entrance: "bounce",
            exit: "fade_out",
            continuous: "pulse",
          },
          textOverlayMeta: {
            category: fact.category,
            isAutoGenerated: true,
          },
          visible: true,
          locked: false,
        }));

        get().pushHistory();
        set({ 
          elements: [...filteredElements, ...newElements],
          dirty: true,
          saveStatus: "unsaved"
        });
      },
    };
  },
);

/* ------------------------------------------------------------------ */
/*  Imperative API (can be used outside React)                        */
/* ------------------------------------------------------------------ */

export const editorActions = {
  play: () => useEditorStore.getState().play(),
  pause: () => useEditorStore.getState().pause(),
  togglePlay: () => useEditorStore.getState().togglePlay(),
  seek: (ms: number) => useEditorStore.getState().seek(ms),
  setPlayhead: (ms: number) => useEditorStore.getState().setPlayhead(ms),
  selectLayer: (id: string | null) => useEditorStore.getState().selectLayer(id),
  selectElement: (id: string | null) => useEditorStore.getState().selectElement(id),
  setZoom: (zoom: number) => useEditorStore.getState().setZoom(zoom),
  setVolume: (v: number) => useEditorStore.getState().setVolume(v),
  undo: () => useEditorStore.getState().undo(),
  redo: () => useEditorStore.getState().redo(),
  split: () => useEditorStore.getState().splitClipAtPlayhead(),
  duplicate: (id: string) => useEditorStore.getState().duplicateElement(id),
  delete: (id: string) => useEditorStore.getState().removeElement(id),
};

/* ------------------------------------------------------------------ */
/*  Auto-injection methods                                             */
/* ------------------------------------------------------------------ */

export type AudioTrackInput = {
  id: string;
  r2Url: string;
  durationMs: number;
  name?: string;
  waveformPeaks?: number[] | null;
};

export function injectAudio(audioTrack: AudioTrackInput): string {
  const state = useEditorStore.getState();
  const sm = editorStateManager;
  const current = sm.getState();

  const itemId = `audio-${audioTrack.id}`;
  const audioItem: IAudio = {
    id: itemId,
    name: audioTrack.name ?? "Voiceover",
    type: "audio",
    display: { from: 0, to: audioTrack.durationMs },
    trim: { from: 0, to: audioTrack.durationMs },
    duration: audioTrack.durationMs,
    playbackRate: 1,
    details: {
      src: audioTrack.r2Url,
      volume: 100,
    },
    metadata: {
      audioAssetId: audioTrack.id,
    },
  };

  const nextTracks = [...current.tracks, makeDesigncomboTrack("audio", [itemId])];
  const nextIds = [...current.trackItemIds, itemId];

  sm.updateState(
    {
      tracks: nextTracks,
      trackItemIds: nextIds,
      trackItemsMap: { ...current.trackItemsMap, [itemId]: audioItem },
    },
    { updateHistory: true, kind: "add" },
  );

  const element: EditorElement = {
    id: itemId,
    type: "audio",
    trackIndex: 4,
    startMs: 0,
    endMs: audioTrack.durationMs,
    audioAssetId: audioTrack.id,
    mediaUrl: audioTrack.r2Url,
    mediaName: audioTrack.name ?? "Voiceover",
    waveformPeaks: audioTrack.waveformPeaks ?? null,
    visible: true,
    locked: false,
  };

  useEditorStore.setState((s) => ({
    elements: [...s.elements, element],
    dirty: true,
  }));

  return itemId;
}

export type SubtitleInjectOptions = {
  style?: SubtitleStyle;
  /** Merge all cues into one master caption item (default true). */
  masterCaption?: boolean;
  /** Canvas size for caption positioning (defaults to store size). */
  canvasWidth?: number;
  canvasHeight?: number;
};

export function injectSubtitles(
  cues: SubtitleCue[],
  options?: SubtitleInjectOptions,
): string[] {
  if (cues.length === 0) return [];

  const state = useEditorStore.getState();
  const sm = editorStateManager;
  const current = sm.getState();
  const style = options?.style ?? state.subtitleStyle;
  const canvasW = options?.canvasWidth ?? state.size.width;
  const canvasH = options?.canvasHeight ?? state.size.height;
  const useMaster = options?.masterCaption !== false;

  useEditorStore.setState({
    subtitleCues: cues,
    subtitleStyle: style,
    dirty: true,
  });

  let items: ICaption[];
  let captionIds: string[];

  if (useMaster) {
    const combinedWords: Array<{ word: string; start: number; end: number; confidence: number; is_keyword: boolean }> = [];
    let combinedText = "";
    const startMs = cues[0].startMs;
    for (const cue of cues) {
      if (combinedText) combinedText += " ";
      combinedText += cue.text;
      const relStart = cue.startMs;
      if (cue.words) {
        for (const w of cue.words) {
          combinedWords.push({
            word: w.word,
            start: Math.max(0, cue.startMs - startMs + w.startMs - relStart),
            end: Math.max(0, cue.startMs - startMs + w.endMs - relStart),
            confidence: 1,
            is_keyword: false,
          });
        }
      }
    }

    const masterCue: SubtitleCue = {
      id: "master",
      startMs,
      endMs: cues[cues.length - 1].endMs,
      text: combinedText,
      words: combinedWords.map((w) => ({
        word: w.word,
        startMs: startMs + w.start,
        endMs: startMs + w.end,
      })),
    };

    const masterId = `sub-master`;
    items = [buildCaptionItem(masterCue, style, canvasW, canvasH, masterId)];
    captionIds = [masterId];
  } else {
    items = cues.map((cue, i) => {
      const id = `sub-${cue.id ?? `cue-${i}`}`;
      return buildCaptionItem(cue, style, canvasW, canvasH, id);
    });
    captionIds = items.map((i) => i.id);
  }

  const nextTrack = makeDesigncomboTrack("caption", captionIds);
  const nextTracks = [...current.tracks, nextTrack];
  const nextIds = [...current.trackItemIds, ...captionIds];
  const nextMap = { ...current.trackItemsMap };
  for (const item of items) {
    nextMap[item.id] = item;
  }

  sm.updateState(
    {
      tracks: nextTracks,
      trackItemIds: nextIds,
      trackItemsMap: nextMap,
    },
    { updateHistory: true, kind: "add" },
  );

  return captionIds;
}

export function syncMedia(assets: LoadedProjectAssets["media"]): void {
  useEditorStore.setState({
    media: assets.map((m) => ({
      id: m.id,
      type: m.type,
      originalName: m.originalName,
      r2Url: m.r2Url,
      thumbnailUrl: m.thumbnailUrl,
    })),
    dirty: true,
  });
}

/* ------------------------------------------------------------------ */
/*  Re-exports                                                        */
/* ------------------------------------------------------------------ */

/** @deprecated Use `useEditorStore.getState().zoom` or derive from fps. */
const PX_PER_SEC = 60;

export { ASPECT_RATIOS, PX_PER_SEC, msToFrames, framesToMs, DEFAULT_EDITOR_TRACKS };
