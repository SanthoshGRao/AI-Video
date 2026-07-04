import { create } from "zustand";
import type { Project } from "@/types";

interface ProjectState {
  project: Project | null;
  isLoading: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;

  setProject: (project: Project | null) => void;
  updateProject: (patch: Partial<Project>) => void;
  setSaving: (saving: boolean) => void;
  setLastSaved: (date: Date) => void;
  setHasUnsavedChanges: (has: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  isLoading: false,
  isSaving: false,
  lastSaved: null,
  hasUnsavedChanges: false,

  setProject: (project) =>
    set({ project, hasUnsavedChanges: false }),

  updateProject: (patch) =>
    set((state) => ({
      project: state.project ? { ...state.project, ...patch } : null,
      hasUnsavedChanges: true,
    })),

  setSaving: (saving) =>
    set({ isSaving: saving }),

  setLastSaved: (date) =>
    set({ lastSaved: date, hasUnsavedChanges: false }),

  setHasUnsavedChanges: (has) =>
    set({ hasUnsavedChanges: has }),

  setLoading: (loading) =>
    set({ isLoading: loading }),
}));
