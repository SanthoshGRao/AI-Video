/**
 * Phase 1.5 — Timeline Occupancy Engine.
 *
 * Pure helpers for placement decisions. Tracks per-(scene, track) usage,
 * detects overlaps/collisions, and finds gaps + safe positions.
 *
 * No state is held — every call recomputes from the immutable ProjectSec.
 * Cheap enough for use during drag interactions.
 */

import type { ClipSec, ProjectSec } from "./types";

const EPS = 1e-6;

export interface Range {
  start: number;
  end: number;
}

export interface Gap extends Range {
  /** end - start; Infinity for the trailing gap. */
  duration: number;
}

export interface CollisionInfo {
  occupied: boolean;
  hits: ClipSec[];
}

function clipsOn(
  project: ProjectSec,
  sceneId: string,
  trackId: number,
  exceptId?: string,
): ClipSec[] {
  return project.clips
    .filter(
      (c) => c.sceneId === sceneId && c.trackId === trackId && c.id !== exceptId,
    )
    .sort((a, b) => a.startTime - b.startTime);
}

/** True if `[start, end)` overlaps any clip on the (scene, track). */
export function isOccupied(
  project: ProjectSec,
  sceneId: string,
  trackId: number,
  start: number,
  end: number,
  exceptId?: string,
): boolean {
  for (const c of clipsOn(project, sceneId, trackId, exceptId)) {
    if (start + EPS < c.endTime && end - EPS > c.startTime) return true;
  }
  return false;
}

/** Detailed collision report — all clips a range would hit. */
export function detectCollisions(
  project: ProjectSec,
  sceneId: string,
  trackId: number,
  start: number,
  end: number,
  exceptId?: string,
): CollisionInfo {
  const hits: ClipSec[] = [];
  for (const c of clipsOn(project, sceneId, trackId, exceptId)) {
    if (start + EPS < c.endTime && end - EPS > c.startTime) hits.push(c);
  }
  return { occupied: hits.length > 0, hits };
}

/** All gaps (including the trailing open gap) on a (scene, track). */
export function listGaps(
  project: ProjectSec,
  sceneId: string,
  trackId: number,
  exceptId?: string,
): Gap[] {
  const clips = clipsOn(project, sceneId, trackId, exceptId);
  const gaps: Gap[] = [];
  let cursor = 0;
  for (const c of clips) {
    if (c.startTime - cursor > EPS) {
      gaps.push({ start: cursor, end: c.startTime, duration: c.startTime - cursor });
    }
    cursor = Math.max(cursor, c.endTime);
  }
  gaps.push({ start: cursor, end: Number.POSITIVE_INFINITY, duration: Number.POSITIVE_INFINITY });
  return gaps;
}

/** Find the first gap (after `from`) that fits `duration`. */
export function findGap(
  project: ProjectSec,
  sceneId: string,
  trackId: number,
  duration: number,
  from = 0,
  exceptId?: string,
): Gap | null {
  for (const g of listGaps(project, sceneId, trackId, exceptId)) {
    const start = Math.max(g.start, from);
    const usable = g.end - start;
    if (usable >= duration - EPS) {
      return { start, end: start + duration, duration };
    }
  }
  return null;
}

/**
 * Resolve the nearest valid start position for a clip of `duration` near
 * `desiredStart`. Returns the original position if free, else snaps forward
 * to the next gap that can hold it.
 */
export function findAvailablePosition(
  project: ProjectSec,
  sceneId: string,
  trackId: number,
  duration: number,
  desiredStart: number,
  exceptId?: string,
): number {
  const start = Math.max(0, desiredStart);
  if (!isOccupied(project, sceneId, trackId, start, start + duration, exceptId)) {
    return start;
  }
  const fwd = findGap(project, sceneId, trackId, duration, start, exceptId);
  if (fwd) return fwd.start;
  // fallback: append to end
  const tail = clipsOn(project, sceneId, trackId, exceptId).reduce(
    (m, c) => Math.max(m, c.endTime),
    0,
  );
  return tail;
}

export interface CollisionResolution {
  startTime: number;
  endTime: number;
  shifted: boolean;
}

/**
 * Resolve a collision by snapping the proposed range forward to the next
 * available slot of the same duration.
 */
export function resolveCollision(
  project: ProjectSec,
  sceneId: string,
  trackId: number,
  proposedStart: number,
  proposedEnd: number,
  exceptId?: string,
): CollisionResolution {
  const duration = Math.max(EPS, proposedEnd - proposedStart);
  const start = findAvailablePosition(
    project,
    sceneId,
    trackId,
    duration,
    proposedStart,
    exceptId,
  );
  return {
    startTime: start,
    endTime: start + duration,
    shifted: Math.abs(start - proposedStart) > EPS,
  };
}
