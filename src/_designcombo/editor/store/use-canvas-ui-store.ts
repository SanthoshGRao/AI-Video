import { create } from "zustand";

export type SnapGuideLines = {
  vertical: number[];
  horizontal: number[];
};

type CanvasUiState = {
  snapGuides: SnapGuideLines;
  showSafeArea: boolean;
  showGrid: boolean;
  setSnapGuides: (guides: SnapGuideLines) => void;
  clearSnapGuides: () => void;
  setShowSafeArea: (v: boolean) => void;
  setShowGrid: (v: boolean) => void;
};

export const useCanvasUiStore = create<CanvasUiState>((set) => ({
  snapGuides: { vertical: [], horizontal: [] },
  showSafeArea: true,
  showGrid: false,
  setSnapGuides: (snapGuides) => set({ snapGuides }),
  clearSnapGuides: () => set({ snapGuides: { vertical: [], horizontal: [] } }),
  setShowSafeArea: (showSafeArea) => set({ showSafeArea }),
  setShowGrid: (showGrid) => set({ showGrid }),
}));
