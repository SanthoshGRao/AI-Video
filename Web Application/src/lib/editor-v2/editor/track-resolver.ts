/**
 * Legacy (pixel-based) active-clip resolver for the Canvas Renderer.
 *
 * The editor-store still describes clips in pixel space (start, width, track).
 * The Canvas renders elements, and every element is backed by one or more
 * clips. This module enforces the same single-clip-per-track invariant the
 * time-based resolver enforces in `selectors.ts`:
 *
 *   For every track, at most ONE clip is active at any instant.
 *
 * Without a runtime transition system, two clips on the same track that share
 * a moment in time is a bug. We pick the clip with the latest `start` (most
 * recently placed wins, like every NLE) and discard the rest so the canvas
 * never renders two same-track sources simultaneously.
 */

import type { Clip } from "../editor-data";
import { PX_PER_SECOND } from "../editor-data";

export interface TrackResolution {
  /** trackId -> single active clip on that track (or undefined if none). */
  active: Map<number, Clip>;
  /** trackId -> count of clips whose interval contains `playheadSec`. */
  rawCounts: Map<number, number>;
  /** trackIds where rawCounts > 1 — same-track overlap, invariant violated. */
  violations: number[];
}

function clipInterval(c: Clip): [number, number] {
  const start = c.start / PX_PER_SECOND;
  const end = (c.start + c.width) / PX_PER_SECOND;
  return [start, end];
}

/** Active iff playhead in [start, end). End-exclusive — matches resolveScene. */
export function isClipActive(c: Clip, playheadSec: number): boolean {
  const [s, e] = clipInterval(c);
  return playheadSec >= s && playheadSec < e;
}

export function resolveActiveByTrack(
  clips: Clip[],
  playheadSec: number,
): TrackResolution {
  const active = new Map<number, Clip>();
  const rawCounts = new Map<number, number>();
  for (const c of clips) {
    if (!isClipActive(c, playheadSec)) continue;
    rawCounts.set(c.track, (rawCounts.get(c.track) ?? 0) + 1);
    const existing = active.get(c.track);
    if (
      !existing ||
      c.start > existing.start ||
      (c.start === existing.start && c.id > existing.id)
    ) {
      active.set(c.track, c);
    }
  }
  const violations: number[] = [];
  for (const [tid, n] of rawCounts) if (n > 1) violations.push(tid);
  return { active, rawCounts, violations };
}

/** Set of clip ids that are the resolved active clip for their track. */
export function activeClipIdSet(clips: Clip[], playheadSec: number): Set<string> {
  const out = new Set<string>();
  for (const c of resolveActiveByTrack(clips, playheadSec).active.values()) {
    out.add(c.id);
  }
  return out;
}
