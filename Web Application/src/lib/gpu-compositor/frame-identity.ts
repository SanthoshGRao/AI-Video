import type { FrameIdentity } from "./types";

/** Monotonic per-compositor-instance counter — not exported so every
 * `GpuCompositor` gets its own sequence (see compositor.ts). */
export function createFrameIdCounter(): () => number {
  let next = 0;
  return () => next++;
}

export function buildFrameIdentity(params: {
  frameId: number;
  presentationTimestamp: number;
  timelineTimestamp: number;
  clipIds: string[];
  version: number;
  textureId: number | null;
}): FrameIdentity {
  return {
    frameId: params.frameId,
    presentationTimestamp: params.presentationTimestamp,
    timelineTimestamp: params.timelineTimestamp,
    clipIds: params.clipIds,
    version: params.version,
    textureId: params.textureId,
  };
}
