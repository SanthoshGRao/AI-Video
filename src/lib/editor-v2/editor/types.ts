/**
 * Phase 0 — Time-based domain model.
 * Time is ALWAYS in seconds (float). Pixels live only in the render layer.
 */

export type ClipKind = "video" | "audio" | "text" | "image" | "overlay" | "subtitle";
export type TrackKind = ClipKind;

/** Per-clip transform applied at render time (0-100% of stage). */
export interface ClipTransform {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity?: number;
}

/** Per-clip audio properties. Applies to video AND audio clips. */
export interface ClipAudio {
  /** 0..2 (0% silent, 100% unity, 200% boost). Defaults to 1. */
  volume?: number;
  muted?: boolean;
  /** Fade lengths in seconds (audio clips only). */
  fadeIn?: number;
  fadeOut?: number;
  /** Solo mutes every other audible clip in the project. */
  solo?: boolean;
}

/** Time-based clip — single source of truth. */
export interface ClipSec {
  id: string;
  sceneId: string;
  trackId: number;
  kind: ClipKind;
  name: string;

  /** Position on the timeline, in seconds. */
  startTime: number;
  endTime: number;

  /** Media offsets (seconds into the source). */
  mediaIn?: number;
  mediaOut?: number;

  /** Source asset reference. */
  src?: string;
  mediaKind?: "video" | "image" | "audio";
  thumb?: string;
  color?: string;

  /** Audio mixing — applies to video clips with sound too. */
  audio?: ClipAudio;

  /** Optional linked stage element (legacy compatibility). */
  elementId?: string;

  /** Optional per-clip transform — when present, canvas reads this. */
  transform?: ClipTransform;

  playbackRate?: number;
}

export interface Track {
  id: number;
  kind: TrackKind;
  label: string;
  locked?: boolean;
  hidden?: boolean;
  muted?: boolean;
  solo?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  /** Optional scene-level duration override (seconds). */
  duration?: number;
  order: number;
}

export interface ProjectSec {
  id: string;
  name: string;
  scenes: Scene[];
  tracks: Track[];
  clips: ClipSec[];
}

export const DEFAULT_SCENE_ID = "scene_main";

export function makeDefaultProject(name = "Untitled Project"): ProjectSec {
  return {
    id: "project_default",
    name,
    scenes: [{ id: DEFAULT_SCENE_ID, name: "Main", order: 0 }],
    tracks: [
      { id: 1, kind: "video", label: "Video 1" },
      { id: 2, kind: "image", label: "Image 1" },
      { id: 3, kind: "text", label: "Text 1" },
      { id: 4, kind: "audio", label: "Audio 1" },
    ],
    clips: [],
  };
}

export const clipDuration = (c: ClipSec) => Math.max(0, c.endTime - c.startTime);
