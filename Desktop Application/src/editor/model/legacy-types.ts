/**
 * legacy-types.ts — mirror of the DB wire format defined in
 * Web Application/src/lib/timeline/types.ts.
 *
 * This is a data-contract mirror, not a code import: Desktop Application
 * has no runtime dependency on Web Application's source. Whenever
 * Web Application/src/lib/timeline/types.ts changes shape, update this
 * file to match — see legacy-adapter.ts for the round-trip logic that
 * consumes it.
 */

export type TrackType = "video" | "audio" | "voiceover" | "text" | "subtitle";

export interface TimelineTrack {
  id: string;
  type: TrackType;
  name: string;
  muted: boolean;
  locked: boolean;
  clipIds: string[];
}

export interface TimelineClip {
  id: string;
  trackId: string;
  mediaAssetId?: string;
  audioAssetId?: string;
  subtitleTrackId?: string;
  type: "video" | "image" | "audio" | "text" | "subtitle" | "shape";
  startTime: number;
  endTime: number;
  trimStart: number;
  trimEnd: number;
  properties: Record<string, unknown>;
}

export interface TimelineTransition {
  id: string;
  type: "fade" | "zoom" | "slide" | "blur" | "push" | "wipe" | "flip";
  clipAId: string;
  clipBId: string;
  durationMs: number;
}

export interface TimelineTextLayer {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style: Record<string, unknown>;
  animation: string;
  position: { x: number; y: number };
}

export interface TimelineSettings {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  backgroundColor: string;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  subtitlePresetName?: string;
  subtitleTrackId?: string;
  projectMediaIds?: string[];
}

export interface TimelineDocument {
  tracks: TimelineTrack[];
  clips: Record<string, TimelineClip>;
  transitions: TimelineTransition[];
  textLayers: TimelineTextLayer[];
  settings: TimelineSettings;
}

export interface TimelineRow {
  id: string;
  projectId: string;
  version: number;
  tracks: TimelineTrack[];
  clips: Record<string, TimelineClip>;
  transitions: TimelineTransition[] | null;
  textLayers: TimelineTextLayer[] | null;
  settings: TimelineSettings | null;
  isAutosave: boolean;
  isAiGenerated: boolean;
  createdAt: string;
}
