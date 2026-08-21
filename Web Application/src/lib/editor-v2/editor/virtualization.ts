/**
 * Phase 2 — Timeline virtualization & auto-scroll helpers.
 *
 * Pure math only. UI components import these to render just the visible slice
 * of a 5,000-clip / 100-track timeline at 60fps.
 */

import type { ClipSec, ProjectSec } from "./types";

export interface Viewport {
  /** Horizontal scroll in pixels. */
  scrollX: number;
  /** Visible width in pixels. */
  width: number;
  /** Pixels per second (derived from zoom). */
  pxPerSecond: number;
  /** Optional overscan in seconds on each side. */
  overscanSec?: number;
}

export function visibleTimeRange(v: Viewport): { start: number; end: number } {
  const over = v.overscanSec ?? 0.5;
  const start = Math.max(0, v.scrollX / v.pxPerSecond - over);
  const end = (v.scrollX + v.width) / v.pxPerSecond + over;
  return { start, end };
}

/**
 * Filter clips down to those whose time range intersects the viewport AND
 * whose track is in `visibleTrackIds`. Optional `sceneId` filter.
 */
export function filterVisibleClips(
  project: ProjectSec,
  v: Viewport,
  visibleTrackIds: Set<number>,
  sceneId?: string,
): ClipSec[] {
  const { start, end } = visibleTimeRange(v);
  const out: ClipSec[] = [];
  for (const c of project.clips) {
    if (sceneId && c.sceneId !== sceneId) continue;
    if (!visibleTrackIds.has(c.trackId)) continue;
    if (c.endTime < start || c.startTime > end) continue;
    out.push(c);
  }
  return out;
}

/** Window the track list given a row height and viewport height. */
export function visibleTrackIds(
  trackIds: number[],
  scrollY: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 2,
): Set<number> {
  const first = Math.max(0, Math.floor(scrollY / rowHeight) - overscan);
  const count = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  return new Set(trackIds.slice(first, first + count));
}

/* ============================================================
 * Auto-scroll: keep playhead inside viewport during playback.
 * ============================================================ */

export interface AutoScrollInput {
  scrollX: number;
  width: number;
  pxPerSecond: number;
  playheadTime: number;
  /** 0-1, fraction of viewport before scroll kicks in (default 0.8). */
  threshold?: number;
}

/**
 * Returns the new scrollX if the playhead has crossed the threshold,
 * otherwise null (no scroll needed).
 */
export function autoScroll(input: AutoScrollInput): number | null {
  const threshold = input.threshold ?? 0.8;
  const playheadPx = input.playheadTime * input.pxPerSecond;
  const right = input.scrollX + input.width;
  const trigger = input.scrollX + input.width * threshold;
  if (playheadPx >= trigger && playheadPx <= right + input.width) {
    // Recenter so playhead sits at ~20% from the left of the viewport.
    return Math.max(0, playheadPx - input.width * 0.2);
  }
  if (playheadPx < input.scrollX) {
    return Math.max(0, playheadPx - input.width * 0.2);
  }
  return null;
}
