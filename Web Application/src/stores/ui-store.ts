import { create } from "zustand";

interface UIState {
  activePanel: "assets" | "properties" | "layers" | null;
  openModals: string[];
  toasts: Toast[];

  setActivePanel: (panel: UIState["activePanel"]) => void;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
  duration?: number;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: null,
  openModals: [],
  toasts: [],

  setActivePanel: (panel) =>
    set({ activePanel: panel }),

  openModal: (id) =>
    set((state) => ({
      openModals: [...state.openModals, id],
    })),

  closeModal: (id) =>
    set((state) => ({
      openModals: state.openModals.filter((m) => m !== id),
    })),

  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { ...toast, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
      ],
    })),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
