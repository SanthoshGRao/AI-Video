import Timeline from "@designcombo/timeline";
import {
  IComposition,
  ISize,
  ITimelineScaleState,
  ITimelineScrollState,
  ITrack,
  ITrackItem,
  ITransition,
  ItemStructure
} from "@designcombo/types";
import { Moveable } from "@interactify/toolkit";
import { playbackEngine } from "../../../lib/engine/playback";
import { create } from "zustand";
import { dispatch } from "@designcombo/events";
import { TIMELINE_SCALE_CHANGED } from "@designcombo/state";

interface ITimelineStore {
  duration: number;
  fps: number;
  scale: ITimelineScaleState;
  scroll: ITimelineScrollState;
  size: ISize;
  tracks: ITrack[];
  trackItemIds: string[];
  transitionIds: string[];
  transitionsMap: Record<string, ITransition>;
  trackItemsMap: Record<string, ITrackItem>;
  structure: ItemStructure[];
  activeIds: string[];
  timeline: Timeline | null;
  setTimeline: (timeline: Timeline) => void;
  setScale: (scale: ITimelineScaleState) => void;
  setScroll: (scroll: ITimelineScrollState) => void;
  // Removed Remotion PlayerRef

  sceneMoveableRef: React.RefObject<Moveable> | null;
  setSceneMoveableRef: (ref: React.RefObject<Moveable>) => void;
  setState: (state: any) => Promise<void>;
  compositions: Partial<IComposition>[];
  setCompositions: (compositions: Partial<IComposition>[]) => void;

  background: {
    type: "color" | "image";
    value: string;
  };
  viewTimeline: boolean;
  setViewTimeline: (viewTimeline: boolean) => void;

  // Centralized Playback/Editor State
  currentTime: number;
  playbackState: "playing" | "paused";
  selectedLayer: ITrackItem | null;
  zoom: number;

  // Actions
  setCurrentTime: (timeMs: number) => void;
  setPlaybackState: (state: "playing" | "paused") => void;
  setSelectedLayer: (layer: ITrackItem | null) => void;
  setZoom: (zoom: number) => void;

  // Drag and drop state
  draggedItem: Record<string, any> | null;
  setDraggedItem: (item: Record<string, any> | null) => void;
}

const useStore = create<ITimelineStore>((set) => ({
  compositions: [],
  structure: [],
  setCompositions: (compositions) => set({ compositions }),
  size: {
    width: 1080,
    height: 1920
  },

  background: {
    type: "color",
    value: "transparent"
  },
  viewTimeline: true,
  setViewTimeline: (viewTimeline) => set({ viewTimeline }),

  timeline: null,
  duration: 1000,
  fps: 30,
  scale: {
    // 1x distance (second 0 to second 5, 5 segments).
    index: 7,
    unit: 300,
    zoom: 1 / 300,
    segments: 5
  },
  scroll: {
    left: 0,
    top: 0
  },
  // playerRef removed
  activeIds: [],
  targetIds: [],
  tracks: [],
  trackItemIds: [],
  transitionIds: [],
  transitionsMap: {},
  trackItemsMap: {},
  sceneMoveableRef: null,

  // Centralized values
  currentTime: 0,
  playbackState: "paused",
  selectedLayer: null,
  zoom: 1 / 300,

  setTimeline: (timeline: Timeline) =>
    set(() => ({
      timeline: timeline
    })),
  setScale: (scale: ITimelineScaleState) =>
    set((currentState) => ({
      scale: scale,
      zoom: scale.zoom
    })),
  setScroll: (scroll: ITimelineScrollState) =>
    set(() => ({
      scroll: scroll
    })),
  setState: async (state) => {
    return set((currentState) => {
      const newState = { ...currentState, ...state };
      
      // Derive selectedLayer
      let selectedLayer = newState.selectedLayer;
      if (state.activeIds !== undefined || state.trackItemsMap !== undefined) {
        const activeIds = newState.activeIds || [];
        selectedLayer = activeIds.length === 1 ? (newState.trackItemsMap[activeIds[0]] || null) : null;
      }

      // Derive zoom
      let zoom = newState.zoom;
      if (state.scale !== undefined) {
        zoom = state.scale.zoom;
      }

      return {
        ...newState,
        selectedLayer,
        zoom
      };
    });
  },
  // setPlayerRef removed
  setSceneMoveableRef: (ref) => set({ sceneMoveableRef: ref }),

  // Actions implementation
  setCurrentTime: (timeMs) => {
    playbackEngine.seek(timeMs);
    set({ currentTime: timeMs });
  },
  setPlaybackState: (playbackState) => {
    if (playbackState === "playing") playbackEngine.play();
    else playbackEngine.pause();
    set({ playbackState });
  },
  setSelectedLayer: (layer) => {
    set((state) => {
      const activeIds = layer ? [layer.id] : [];
      // Dispatch selection event to stateManager / timeline selection
      setTimeout(() => {
        dispatch("layer:selection", {
          payload: { activeIds }
        });
      }, 0);
      return { selectedLayer: layer, activeIds };
    });
  },
  setZoom: (zoomVal) => {
    set((state) => {
      const newScale = {
        ...state.scale,
        zoom: zoomVal,
        unit: 1 / zoomVal
      };
      // Dispatch scale change event to timeline ruler
      setTimeout(() => {
        dispatch(TIMELINE_SCALE_CHANGED, {
          payload: { scale: newScale }
        });
      }, 0);
      return { scale: newScale, zoom: zoomVal };
    });
  },
  draggedItem: null,
  setDraggedItem: (item) => set({ draggedItem: item })
}));

export default useStore;
