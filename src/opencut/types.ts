export interface OpenCutProject {
  id: string;
  name: string;
  version: number;
  durationMs: number;
  settings: OpenCutSettings;
  scene: OpenCutScene;
  media: OpenCutMediaAsset[];
}

export interface OpenCutSettings {
  fps: number;
  canvasSize: { width: number; height: number };
  background: { type: string; color: string };
}

export interface OpenCutScene {
  id: string;
  name: string;
  isMain: boolean;
  tracks: {
    main: OpenCutTrack;
    overlay: OpenCutTrack[];
    audio: OpenCutTrack[];
  };
  bookmarks: unknown[];
}

export interface OpenCutTrack {
  id: string;
  type: string;
  name?: string;
  elements: OpenCutTimelineElement[];
  muted: boolean;
  hidden: boolean;
}

export interface OpenCutMediaAsset {
  id: string;
  name?: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
  durationMs?: number;
  file?: File;
  width?: number;
  height?: number;
}

/**
 * A single timeline element as produced by the track builders
 * (voice/media/subtitle/fact-overlay). `startTime`/`duration`/`trimStart`/
 * `trimEnd` are all plain milliseconds (NOT the `*Ms`-suffixed names used
 * elsewhere in this codebase) — this matches every builder's actual output.
 */
export interface OpenCutTimelineElement {
  id: string;
  name?: string;
  type: string;
  role?: string;
  mediaId?: string;
  cueId?: string;
  text?: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  volume?: number;
  animation?: string;
  params?: Record<string, unknown>;
  words?: { word: string; startMs: number; endMs: number }[];
  isSourceAudioEnabled?: boolean;
  waveform?: number[] | null;
}

export type OpenCutVideoElement = OpenCutTimelineElement;
export type OpenCutImageElement = OpenCutTimelineElement;
export type OpenCutAudioElement = OpenCutTimelineElement;
export type OpenCutTextElement = OpenCutTimelineElement;
