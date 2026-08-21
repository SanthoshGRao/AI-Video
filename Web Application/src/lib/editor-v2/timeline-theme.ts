import type { TrackKind } from "./editor-data";

/** Muted NLE-style timeline palette — flat, low saturation. */
export const TIMELINE = {
  playhead: "#e2e8f0",
  playheadGlow: "rgba(226, 232, 240, 0.25)",
  snapGuide: "rgba(148, 163, 184, 0.55)",
  selectionRing: "#818cf8",
  selectionGlow: "rgba(129, 140, 248, 0.55)",
  trackHover: "rgba(255,255,255,0.02)",
  rulerTick: "#475569",
  rulerLabel: "#94a3b8",
} as const;

export function clipChrome(kind: TrackKind): {
  bg: string;
  border: string;
  accent: string;
  label: string;
} {
  switch (kind) {
    case "video":
      return {
        bg: "#2a323c",
        border: "rgba(100, 116, 139, 0.35)",
        accent: "#64748b",
        label: "#e2e8f0",
      };
    case "image":
      return {
        bg: "#2f3440",
        border: "rgba(100, 116, 139, 0.35)",
        accent: "#94a3b8",
        label: "#e2e8f0",
      };
    case "audio":
      return {
        bg: "#162822",
        border: "rgba(16, 185, 129, 0.2)",
        accent: "#10b981",
        label: "#a7f3d0",
      };
    case "text":
      return {
        bg: "#3a3428",
        border: "rgba(251, 191, 36, 0.22)",
        accent: "#d97706",
        label: "#fef3c7",
      };
    case "subtitle":
      return {
        bg: "#283040",
        border: "rgba(96, 165, 250, 0.22)",
        accent: "#60a5fa",
        label: "#dbeafe",
      };
    case "overlay":
      return {
        bg: "#333842",
        border: "rgba(148, 163, 184, 0.25)",
        accent: "#94a3b8",
        label: "#f1f5f9",
      };
    default:
      return {
        bg: "#2d333b",
        border: "rgba(100, 116, 139, 0.35)",
        accent: "#64748b",
        label: "#f8fafc",
      };
  }
}
