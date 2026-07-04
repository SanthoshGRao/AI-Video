export type RenderItemType = "video" | "image" | "audio" | "text" | "caption" | "shape";

export interface RenderTrackItem {
  id: string;
  name: string;
  type: RenderItemType;
  display: { from: number; to: number };
  trim?: { from: number; to: number };
  duration?: number;
  playbackRate?: number;
  isMain?: boolean;
  // Loosely typed on purpose: this is a duck-typed rendering payload consumed
  // by the compositor/export-player, which already read/cast individual
  // fields defensively (`as`, optional chaining) rather than relying on a
  // rigid shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any>;
  metadata?: Record<string, unknown>;
}

export interface RenderTrack {
  id: string;
  type: string;
  items: string[];
  muted?: boolean;
}

export interface RenderTransition {
  id: string;
  trackId: string;
  fromId: string;
  toId: string;
  type?: string;
  duration?: number;
}

export interface RenderDoc {
  id: string;
  fps: number;
  size: { width: number; height: number };
  duration: number;
  tracks: RenderTrack[];
  trackItemIds: string[];
  trackItemsMap: Record<string, RenderTrackItem>;
  transitionIds: string[];
  transitionsMap: Record<string, RenderTransition>;
  background: { type: "color" | "image"; value: string };
}
