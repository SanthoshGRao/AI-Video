/**
 * Phase 1 — Active Clip Resolver + Active Clip Window cache.
 *
 * `resolveScene` is the SINGLE rendering contract used by:
 *   - Canvas
 *   - Audio Engine (future)
 *   - Subtitle Engine (future)
 *   - Export Engine (future)
 *
 * The ActiveClipWindow cache avoids per-frame recalculation by only
 * recomputing when the playhead crosses a clip boundary, the scene changes,
 * or the project shape changes.
 */

import type { ClipSec, ProjectSec } from "./types";
import { clipLayerZIndex } from "@/lib/editor-v2/layer-priority";

/* ----------------------- pixel helpers ----------------------- */
export const timeToPx = (time: number, pxPerSecond: number) => time * pxPerSecond;
export const pxToTime = (px: number, pxPerSecond: number) => px / pxPerSecond;

/* ----------------------- duration helpers ------------------- */
export function timelineDuration(project: ProjectSec): number {
  return project.clips.reduce((m, c) => Math.max(m, c.endTime), 0);
}

export function nextFreeStart(project: ProjectSec, trackId: number, except?: string): number {
  return project.clips
    .filter((c) => c.trackId === trackId && c.id !== except)
    .reduce((m, c) => Math.max(m, c.endTime), 0);
}

/* ----------------------- active-clip resolver --------------- */

export interface ActiveClip {
  clip: ClipSec;
  /** Time within the source media: currentTime - clip.startTime + mediaIn. */
  localTime: number;
  /** trackId is the primary sort key; trackId-as-z when z is missing. */
  zIndex: number;
}

/** Legacy alias used by editor-debug. */
export function resolveActiveClips(project: ProjectSec, time: number): ClipSec[] {
  return resolveScene(project, null, time).map((a) => a.clip);
}

/**
 * Ordered active render list for `sceneId` at `currentTime`.
 *
 *   active when  currentTime >= startTime  AND  currentTime <  endTime
 *
 * End is EXCLUSIVE — back-to-back clips on the same track render
 * sequentially with no one-frame overlap at the boundary.
 *
 * INVARIANT — Single-clip-per-track:
 *   Without a runtime transition system, only ONE clip per track may be
 *   active at any instant. If the timeline contains an overlap on the same
 *   track (a data bug — the Timeline Engine should prevent it), this
 *   resolver picks the clip with the latest startTime (the most recently
 *   placed clip "wins", matching standard NLE behaviour) and discards the
 *   rest. The Playback Engine, Canvas, Media Sync and Export Engine all
 *   share this single contract — there is no other place where "active" is
 *   decided.
 *
 * Sort by trackId asc, then zIndex asc. Pass `null` sceneId to include all.
 */
export function resolveScene(
  project: ProjectSec,
  sceneId: string | null,
  currentTime: number,
): ActiveClip[] {
  const perTrack = new Map<number, ActiveClip>();
  for (const c of project.clips) {
    if (sceneId && c.sceneId !== sceneId) continue;
    if (!(currentTime >= c.startTime && currentTime < c.endTime)) continue;
    const candidate: ActiveClip = {
      clip: c,
      localTime: (currentTime - c.startTime) * (c.playbackRate ?? 1) + (c.mediaIn ?? 0),
      zIndex: clipLayerZIndex(c.kind),
    };
    const existing = perTrack.get(c.trackId);
    if (!existing) {
      perTrack.set(c.trackId, candidate);
      continue;
    }
    const ex = existing.clip;
    if (
      c.startTime > ex.startTime ||
      (c.startTime === ex.startTime && c.id > ex.id)
    ) {
      perTrack.set(c.trackId, candidate);
    }
  }
  const out = Array.from(perTrack.values());
  out.sort((a, b) => a.zIndex - b.zIndex || a.clip.trackId - b.clip.trackId);
  return out;
}

/**
 * Diagnostic — every clip whose interval contains `currentTime`, WITHOUT
 * applying the single-clip-per-track invariant. Debug HUD / integrity
 * checks only; never for rendering, audio, or export.
 */
export function rawActiveClips(
  project: ProjectSec,
  sceneId: string | null,
  currentTime: number,
): ClipSec[] {
  const out: ClipSec[] = [];
  for (const c of project.clips) {
    if (sceneId && c.sceneId !== sceneId) continue;
    if (currentTime >= c.startTime && currentTime < c.endTime) out.push(c);
  }
  return out;
}

/* ----------------------- Active Clip Window cache ----------- */

/**
 * A window inside which the active-clip set is constant. The next change
 * happens at `nextBoundary`. We recompute only when the playhead crosses
 * `start` or `nextBoundary`, the scene changes, or `project` identity changes.
 */
export interface ActiveClipWindow {
  projectRef: ProjectSec;
  sceneId: string | null;
  start: number;
  nextBoundary: number;
  clips: ActiveClip[];
}

function computeBoundaries(project: ProjectSec, sceneId: string | null): number[] {
  const set = new Set<number>([0]);
  for (const c of project.clips) {
    if (sceneId && c.sceneId !== sceneId) continue;
    set.add(c.startTime);
    set.add(c.endTime);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function windowFor(
  project: ProjectSec,
  sceneId: string | null,
  currentTime: number,
  boundaries: number[],
): ActiveClipWindow {
  let start = boundaries[0] ?? 0;
  let nextBoundary = Number.POSITIVE_INFINITY;
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    if (b <= currentTime) start = b;
    if (b > currentTime) {
      nextBoundary = b;
      break;
    }
  }
  return {
    projectRef: project,
    sceneId,
    start,
    nextBoundary,
    clips: resolveScene(project, sceneId, currentTime),
  };
}

export class ActiveClipWindowCache {
  private current: ActiveClipWindow | null = null;
  private boundaries: number[] = [];
  private projectRef: ProjectSec | null = null;
  private sceneId: string | null = null;

  get(project: ProjectSec, sceneId: string | null, currentTime: number): ActiveClipWindow {
    if (project !== this.projectRef || sceneId !== this.sceneId) {
      this.projectRef = project;
      this.sceneId = sceneId;
      this.boundaries = computeBoundaries(project, sceneId);
      this.current = windowFor(project, sceneId, currentTime, this.boundaries);
      return this.current;
    }
    const w = this.current;
    if (w && currentTime >= w.start && currentTime < w.nextBoundary) {
      return w;
    }
    this.current = windowFor(project, sceneId, currentTime, this.boundaries);
    return this.current;
  }

  invalidate() {
    this.current = null;
    this.projectRef = null;
    this.boundaries = [];
  }
}

/** Singleton — most consumers share one cache; tests can instantiate their own. */
export const activeClipWindow = new ActiveClipWindowCache();
