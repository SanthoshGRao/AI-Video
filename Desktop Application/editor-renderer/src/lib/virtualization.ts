/**
 * virtualization.ts — windowed clip rendering for the timeline. The old
 * web app had a virtualization module with this exact intent
 * ("supports a 5,000-clip / 100-track timeline at 60fps") that was never
 * actually wired into its Timeline component — every clip rendered
 * unconditionally regardless of scroll position. This one is small
 * enough to keep inline in Timeline.tsx's render path, so there's no way
 * for it to silently go unused the same way.
 */

import type { NativeClip } from "../../../src/editor/model/types";

export interface Viewport {
  startPx: number;
  endPx: number;
}

/** Returns only the clips whose pixel range intersects the viewport
 * (plus a buffer on each side so scrolling doesn't pop clips in/out
 * abruptly at the edge). */
export function filterVisibleClips(clips: NativeClip[], pxPerSec: number, viewport: Viewport, bufferPx = 400): NativeClip[] {
  const start = viewport.startPx - bufferPx;
  const end = viewport.endPx + bufferPx;
  return clips.filter((c) => {
    const clipStartPx = c.startSec * pxPerSec;
    const clipEndPx = c.endSec * pxPerSec;
    return clipEndPx >= start && clipStartPx <= end;
  });
}
