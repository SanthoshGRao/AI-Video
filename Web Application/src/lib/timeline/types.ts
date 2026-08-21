/** Timeline document stored in `Timeline.tracks`, `clips`, etc. */

export type TrackType = "video" | "audio" | "voiceover" | "text" | "subtitle";

export type TimelineTrack = {
  id: string;
  type: TrackType;
  name: string;
  muted: boolean;
  locked: boolean;
  clipIds: string[];
};

export type TimelineClip = {
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
};

export type TimelineTransition = {
  id: string;
  type: "fade" | "zoom" | "slide" | "blur" | "push" | "wipe" | "flip";
  clipAId: string;
  clipBId: string;
  durationMs: number;
};

export type TimelineTextLayer = {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style: Record<string, unknown>;
  animation: string;
  position: { x: number; y: number };
};

export type TimelineSettings = {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  backgroundColor: string;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  subtitlePresetName?: string;
  subtitleTrackId?: string;
  /** MediaAsset ids the editor's project-media panel holds — including
   * global-library imports whose MediaAsset row belongs to no project (or a
   * different one). The panel is client state otherwise, so without this a
   * library import that isn't placed on the timeline vanishes on reload. */
  projectMediaIds?: string[];
};

export type TimelineDocument = {
  tracks: TimelineTrack[];
  clips: Record<string, TimelineClip>;
  transitions: TimelineTransition[];
  textLayers: TimelineTextLayer[];
  settings: TimelineSettings;
};

export type TimelineRecord = {
  id: string;
  projectId: string;
  version: number;
  tracks: TimelineTrack[];
  clips: Record<string, TimelineClip>;
  transitions: TimelineTransition[];
  textLayers: TimelineTextLayer[];
  settings: TimelineSettings;
  isAutosave: boolean;
  isAiGenerated: boolean;
  createdAt: string;
};
