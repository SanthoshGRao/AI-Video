export interface OpenCutProject {
  id: string;
  title: string;
  durationMs: number;
  fps: number;
  width: number;
  height: number;
  scene: OpenCutScene;
  media: OpenCutMediaAsset[];
  formatVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpenCutScene {
  id: string;
  type: string;
  tracks: OpenCutTrack[];
}

export interface OpenCutTrack {
  id: string;
  type: string;
  name?: string;
  elements: OpenCutTimelineElement[];
}

export interface OpenCutMediaAsset {
  id: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
  durationMs?: number;
  file?: File;
  width?: number;
  height?: number;
}

export interface OpenCutTimelineElement {
  id: string;
  type: string;
  mediaId?: string;
  text?: string;
  startMs: number;
  durationMs: number;
  trimStartMs?: number;
  trimDurationMs?: number;
  volume?: number;
  position?: { x: number; y: number };
  style?: Record<string, unknown>;
  animation?: string;
}
