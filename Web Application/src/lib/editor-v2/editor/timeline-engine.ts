/**
 * Phase 2 — Timeline Engine V2.
 *
 * Pure operation layer built on top of:
 *   - Command pattern + HistoryEngine
 *   - Transaction system (validate → apply → integrity → commit)
 *   - Occupancy Engine (placement/gap math)
 *
 * Every public operation returns a `Command` (often a `BatchCmd`). Callers
 * execute it via `useEditorCore.getState().run(cmd)` so the transaction
 * pipeline guards the mutation. Builders never mutate the store directly.
 */

import {
  AddClipCmd,
  BatchCmd,
  MoveClipCmd,
  RemoveClipCmd,
  SplitClipCmd,
  TrimClipCmd,
  UpdateClipCmd,
  type Command,
} from "./commands";
import {
  findAvailablePosition,
  resolveCollision,
} from "./occupancy-engine";
import type { ClipSec, ProjectSec } from "./types";

const EPS = 1e-4;
const MIN_DURATION = 0.05;

const uid = (p = "clip") =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const requireClip = (p: ProjectSec, id: string): ClipSec => {
  const c = p.clips.find((x) => x.id === id);
  if (!c) throw new Error(`[timeline-engine] clip not found: ${id}`);
  return c;
};

/* ============================================================
 * 2A — Core operations
 * ============================================================ */

/**
 * Move a clip horizontally and/or vertically. Uses the Occupancy Engine to
 * snap to the nearest free slot on the target track.
 */
export function buildMoveClip(
  project: ProjectSec,
  clipId: string,
  newStart: number,
  newTrackId?: number,
): Command {
  const c = requireClip(project, clipId);
  const trackId = newTrackId ?? c.trackId;
  const duration = c.endTime - c.startTime;
  const start = findAvailablePosition(
    project,
    c.sceneId,
    trackId,
    duration,
    Math.max(0, newStart),
    c.id,
  );
  return new MoveClipCmd(clipId, start, trackId);
}

/** Trim left edge — never below 0, never below MIN_DURATION. */
export function buildTrimLeft(
  project: ProjectSec,
  clipId: string,
  newStart: number,
): Command {
  const c = requireClip(project, clipId);
  const start = Math.max(0, Math.min(newStart, c.endTime - MIN_DURATION));
  const delta = start - c.startTime;
  const nextMediaIn = (c.mediaIn ?? 0) + delta;
  if (c.mediaOut != null && nextMediaIn >= c.mediaOut) {
    throw new Error("[trimLeft] media range invalid");
  }
  return new TrimClipCmd(clipId, start, c.endTime, nextMediaIn);
}

/** Trim right edge — never below MIN_DURATION. */
export function buildTrimRight(
  project: ProjectSec,
  clipId: string,
  newEnd: number,
): Command {
  const c = requireClip(project, clipId);
  const end = Math.max(c.startTime + MIN_DURATION, newEnd);
  return new TrimClipCmd(clipId, c.startTime, end, c.mediaIn);
}

/**
 * Split at absolute time `t`. SplitClipCmd preserves the source clip's
 * transform/metadata/effects/properties on both halves and advances `mediaIn`
 * for the right half by (t - startTime).
 */
export function buildSplitAt(
  project: ProjectSec,
  clipId: string,
  t: number,
): Command | null {
  const c = requireClip(project, clipId);
  if (t <= c.startTime + EPS || t >= c.endTime - EPS) return null;
  return new SplitClipCmd(clipId, t, uid("clip"));
}

/** Split every selected clip currently spanning the playhead. */
export function buildSplitAtPlayhead(
  project: ProjectSec,
  playhead: number,
  clipIds: string[],
): Command | null {
  const cmds: Command[] = [];
  for (const id of clipIds) {
    const c = project.clips.find((x) => x.id === id);
    if (!c) continue;
    if (playhead > c.startTime + EPS && playhead < c.endTime - EPS) {
      cmds.push(new SplitClipCmd(id, playhead, uid("clip")));
    }
  }
  return cmds.length ? new BatchCmd(cmds) : null;
}

/** Delete one or many clips. */
export function buildDelete(clipIds: string[]): Command | null {
  if (!clipIds.length) return null;
  if (clipIds.length === 1) return new RemoveClipCmd(clipIds[0]);
  return new BatchCmd(clipIds.map((id) => new RemoveClipCmd(id)));
}

/* ============================================================
 * 2B — Ripple operations
 * ============================================================ */

/**
 * Ripple delete: remove clip(s) and shift later clips on the SAME track
 * left by the deleted clip's duration so the gap closes.
 */
export function buildRippleDelete(project: ProjectSec, clipIds: string[]): Command | null {
  if (!clipIds.length) return null;
  const cmds: Command[] = [];
  // Group by track so each track's downstream clips shift independently.
  // Sort deletions by startTime ascending so cumulative shifts are correct.
  const byTrack = new Map<string, ClipSec[]>();
  for (const id of clipIds) {
    const c = project.clips.find((x) => x.id === id);
    if (!c) continue;
    const k = `${c.sceneId}::${c.trackId}`;
    let arr = byTrack.get(k);
    if (!arr) {
      arr = [];
      byTrack.set(k, arr);
    }
    arr.push(c);
  }
  const deletedIds = new Set(clipIds);
  for (const arr of byTrack.values()) {
    arr.sort((a, b) => a.startTime - b.startTime);
    let shift = 0;
    let cursor = arr[0].startTime;
    for (const del of arr) {
      shift += del.endTime - del.startTime;
      cursor = del.endTime;
      cmds.push(new RemoveClipCmd(del.id));
    }
    // Shift later clips on this (scene,track) by total shift.
    const sceneId = arr[0].sceneId;
    const trackId = arr[0].trackId;
    for (const c of project.clips) {
      if (
        c.sceneId === sceneId &&
        c.trackId === trackId &&
        !deletedIds.has(c.id) &&
        c.startTime >= cursor - EPS
      ) {
        cmds.push(new MoveClipCmd(c.id, Math.max(0, c.startTime - shift), trackId));
      }
    }
  }
  return cmds.length ? new BatchCmd(cmds) : null;
}

/**
 * Ripple trim right: trim a clip's right edge to `newEnd` and shift later
 * clips on the same track by the same delta so continuity holds.
 */
export function buildRippleTrimRight(
  project: ProjectSec,
  clipId: string,
  newEnd: number,
): Command {
  const c = requireClip(project, clipId);
  const end = Math.max(c.startTime + MIN_DURATION, newEnd);
  const delta = end - c.endTime;
  const cmds: Command[] = [new TrimClipCmd(clipId, c.startTime, end, c.mediaIn)];
  if (Math.abs(delta) > EPS) {
    for (const other of project.clips) {
      if (
        other.id !== c.id &&
        other.sceneId === c.sceneId &&
        other.trackId === c.trackId &&
        other.startTime >= c.endTime - EPS
      ) {
        cmds.push(
          new MoveClipCmd(other.id, Math.max(0, other.startTime + delta), other.trackId),
        );
      }
    }
  }
  return new BatchCmd(cmds);
}

/**
 * Insert edit: insert a new clip at time `t` and push every later clip on
 * the same (scene, track) right by the inserted clip's duration. No overlap.
 */
export function buildInsertEdit(
  project: ProjectSec,
  clip: Omit<ClipSec, "id">,
  t: number,
): Command {
  const start = Math.max(0, t);
  const duration = Math.max(MIN_DURATION, clip.endTime - clip.startTime);
  const cmds: Command[] = [];
  // Shift everything at-or-after `start` on the target (scene, track) right by `duration`.
  for (const c of project.clips) {
    if (
      c.sceneId === clip.sceneId &&
      c.trackId === clip.trackId &&
      c.startTime >= start - EPS
    ) {
      cmds.push(new MoveClipCmd(c.id, c.startTime + duration, c.trackId));
    }
  }
  const newClip: ClipSec = {
    ...clip,
    id: uid("clip"),
    startTime: start,
    endTime: start + duration,
  };
  cmds.push(new AddClipCmd(newClip));
  return new BatchCmd(cmds);
}

/** Lift edit: remove clip, leave the gap intact. */
export function buildLiftEdit(clipIds: string[]): Command | null {
  return buildDelete(clipIds);
}

/** Extract edit: remove clip and close the gap (alias for ripple delete). */
export function buildExtractEdit(project: ProjectSec, clipIds: string[]): Command | null {
  return buildRippleDelete(project, clipIds);
}

/* ============================================================
 * 2C — Duplicate (preserves transforms/metadata/timing/track)
 * ============================================================ */

/**
 * Duplicate clips. Preserves transforms / metadata / effects / properties.
 * Places duplicates immediately after each source clip on the same track,
 * snapping forward if occupied.
 */
export function buildDuplicate(project: ProjectSec, clipIds: string[]): Command | null {
  if (!clipIds.length) return null;
  const cmds: Command[] = [];
  // Recompute occupancy as we add — accumulate a working project copy.
  let working: ProjectSec = project;
  for (const id of clipIds) {
    const c = working.clips.find((x) => x.id === id);
    if (!c) continue;
    const duration = c.endTime - c.startTime;
    const startTime = findAvailablePosition(
      working,
      c.sceneId,
      c.trackId,
      duration,
      c.endTime,
    );
    const copy: ClipSec = {
      ...c,
      id: uid("clip"),
      startTime,
      endTime: startTime + duration,
      transform: c.transform ? { ...c.transform } : undefined,
    };
    cmds.push(new AddClipCmd(copy));
    working = { ...working, clips: [...working.clips, copy] };
  }
  return cmds.length ? new BatchCmd(cmds) : null;
}

/* ============================================================
 * 2C — Copy / Paste with relative offsets preserved
 * ============================================================ */

export interface ClipboardEntry {
  /** Snapshot of the source clip's defining fields (id is regenerated on paste). */
  clip: Omit<ClipSec, "id" | "startTime" | "endTime"> & {
    /** Offset from the clipboard origin (seconds). */
    offsetTime: number;
    /** Original duration. */
    duration: number;
  };
}

export interface ClipboardPayload {
  origin: number;
  entries: ClipboardEntry[];
}

export function makeClipboard(project: ProjectSec, clipIds: string[]): ClipboardPayload | null {
  const clips = clipIds
    .map((id) => project.clips.find((c) => c.id === id))
    .filter((c): c is ClipSec => !!c);
  if (!clips.length) return null;
  const origin = clips.reduce((m, c) => Math.min(m, c.startTime), Infinity);
  return {
    origin,
    entries: clips.map((c) => {
      // strip id/start/end
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, startTime, endTime, ...rest } = c;
      return {
        clip: {
          ...rest,
          offsetTime: startTime - origin,
          duration: endTime - startTime,
        },
      };
    }),
  };
}

/**
 * Paste clipboard at absolute time `pasteAt`. Preserves relative offsets and
 * snaps each clip forward on its track if occupied.
 */
export function buildPaste(
  project: ProjectSec,
  clipboard: ClipboardPayload,
  pasteAt: number,
): Command | null {
  if (!clipboard.entries.length) return null;
  const cmds: Command[] = [];
  let working: ProjectSec = project;
  for (const entry of clipboard.entries) {
    const desired = Math.max(0, pasteAt + entry.clip.offsetTime);
    const startTime = findAvailablePosition(
      working,
      entry.clip.sceneId,
      entry.clip.trackId,
      entry.clip.duration,
      desired,
    );
    const newClip: ClipSec = {
      ...entry.clip,
      id: uid("clip"),
      startTime,
      endTime: startTime + entry.clip.duration,
    };
    cmds.push(new AddClipCmd(newClip));
    working = { ...working, clips: [...working.clips, newClip] };
  }
  return new BatchCmd(cmds);
}

/* ============================================================
 * Group operations (delegate to the single-list builders)
 * ============================================================ */

export function buildGroupMove(
  project: ProjectSec,
  clipIds: string[],
  deltaTime: number,
  deltaTrackIndex: number = 0,
): Command | null {
  if (!clipIds.length) return null;
  const cmds: Command[] = [];
  // Resolve track delta by ordered track index.
  const trackOrder = project.tracks.map((t) => t.id);
  for (const id of clipIds) {
    const c = project.clips.find((x) => x.id === id);
    if (!c) continue;
    const idx = trackOrder.indexOf(c.trackId);
    const nextIdx = Math.max(0, Math.min(trackOrder.length - 1, idx + deltaTrackIndex));
    const nextTrack = trackOrder[nextIdx];
    cmds.push(
      new MoveClipCmd(
        id,
        Math.max(0, c.startTime + deltaTime),
        nextTrack,
      ),
    );
  }
  return cmds.length ? new BatchCmd(cmds) : null;
}

/** Helper: snap-aware resolve for a single clip drag. */
export function resolveDrop(
  project: ProjectSec,
  clipId: string,
  proposedStart: number,
  proposedTrackId?: number,
): { startTime: number; endTime: number; trackId: number; shifted: boolean } {
  const c = requireClip(project, clipId);
  const trackId = proposedTrackId ?? c.trackId;
  const duration = c.endTime - c.startTime;
  const r = resolveCollision(
    project,
    c.sceneId,
    trackId,
    Math.max(0, proposedStart),
    Math.max(0, proposedStart) + duration,
    c.id,
  );
  return { startTime: r.startTime, endTime: r.endTime, trackId, shifted: r.shifted };
}
