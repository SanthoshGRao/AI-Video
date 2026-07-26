/**
 * types.ts — canonical timeline/clip data model for the native desktop
 * editor and rendering engine.
 *
 * This is the ONE model used internally by both the preview compositor and
 * the export renderer, replacing the web app's three parallel shapes
 * (TimelineClip -> EditorElement -> RenderTrackItem) and its two competing
 * preview stores (legacy px-based vs. unused seconds-based "core"). It is
 * seconds-based (not px/ms) and framework-agnostic — no Node or DOM APIs —
 * so it can be imported by both the Electron main process (CommonJS) and
 * the editor-renderer Vite app (ESM) unmodified.
 *
 * `legacy-adapter.ts` is the ONLY place that converts to/from the DB's
 * `TimelineDocument` JSON wire format (Web Application/src/lib/timeline/types.ts).
 */

export type TrackKind = "video" | "audio" | "voiceover" | "text" | "subtitle" | "image" | "overlay";

export interface NativeTrack {
  id: string;
  kind: TrackKind;
  name: string;
  /** Stacking/paint order, bottom -> top. */
  order: number;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
}

export type ClipKind = "video" | "image" | "audio" | "text" | "subtitle" | "shape";

export interface ClipTransform {
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg: number;
  /** 0-1 */
  opacity: number;
}

export interface ClipAudioSettings {
  /** 0-1 */
  volume: number;
  muted: boolean;
  fadeInSec: number;
  fadeOutSec: number;
  solo: boolean;
}

export interface ClipTextSettings {
  content: string;
  style: Record<string, unknown>;
  animation?: { entrance?: string; exit?: string; continuous?: string };
}

export type EffectInstance =
  | { type: "brightness" | "contrast" | "saturation" | "hueRotate"; amount: number }
  | { type: "blur"; radiusPx: number }
  | { type: "lut"; assetId: string; strength: number }
  | { type: "chromaKey"; color: string; tolerance: number }
  | { type: "vignette"; strength: number }
  | { type: "glow"; strength: number }
  | {
      type: "preset";
      id: "grayscale" | "sepia" | "vintage" | "vivid" | "cool" | "warm" | "invert";
    };

export interface NativeClip {
  id: string;
  trackId: string;
  kind: ClipKind;

  startSec: number;
  endSec: number;
  mediaInSec?: number;
  mediaOutSec?: number;

  mediaAssetId?: string;
  audioAssetId?: string;
  subtitleTrackId?: string;
  cueId?: string;

  transform?: ClipTransform;
  fit?: "cover" | "contain" | "fill";

  /** Ordered, parametric effect chain. */
  effects: EffectInstance[];

  text?: ClipTextSettings;
  audio?: ClipAudioSettings;
  playbackRate?: number;
  locked?: boolean;
  visible?: boolean;

  /**
   * Escape hatch: any field found on the source TimelineClip.properties
   * grab-bag that this model doesn't have a typed slot for yet is parked
   * here verbatim and merged back on write, so round-tripping through the
   * native editor never silently drops data the web app wrote.
   */
  raw?: Record<string, unknown>;
}

export type TransitionType = "fade" | "zoom" | "slide" | "blur" | "push" | "wipe" | "flip";

export interface NativeTransition {
  id: string;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  type: TransitionType;
  durationSec: number;
}

export interface NativeProject {
  /** Timeline row id. */
  id: string;
  projectId: string;
  version: number;

  fps: number;
  width: number;
  height: number;
  backgroundColor: string;
  durationSec: number;

  tracks: NativeTrack[];
  clips: NativeClip[];
  transitions: NativeTransition[];
}

/** Creates a minimal empty project — used when a project has no Timeline row yet. */
export function emptyNativeProject(id: string, projectId: string): NativeProject {
  return {
    id,
    projectId,
    version: 1,
    fps: 30,
    width: 1080,
    height: 1920,
    backgroundColor: "#000000",
    durationSec: 0,
    tracks: [],
    clips: [],
    transitions: [],
  };
}
