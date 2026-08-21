/**
 * Phase 1.5 — Timeline Integrity Engine.
 *
 * Runs after every command apply. Pure, fast, never throws.
 * Returns a structured report that the Transaction layer uses to
 * decide commit vs. rollback.
 *
 * Errors  → block the command (transaction rollback).
 * Warnings → permitted but surfaced in the debug HUD.
 */

import type { ClipSec, ProjectSec } from "./types";

export type IntegrityLevel = "error" | "warn";

export interface IntegrityIssue {
  level: IntegrityLevel;
  code:
    | "DUPLICATE_CLIP_ID"
    | "DUPLICATE_TRACK_ID"
    | "DUPLICATE_SCENE_ID"
    | "ORPHAN_CLIP_TRACK"
    | "ORPHAN_CLIP_SCENE"
    | "INVALID_TIME"
    | "NEGATIVE_DURATION"
    | "INVALID_TRACK_REF"
    | "INVALID_SCENE_REF"
    | "INVALID_ZINDEX"
    | "INVALID_TRACK_ORDER"
    | "OVERLAP";
  message: string;
  refs?: { clipId?: string; trackId?: number; sceneId?: string; otherClipId?: string };
}

export interface IntegrityReport {
  valid: boolean;
  errors: IntegrityIssue[];
  warnings: IntegrityIssue[];
  checkedAt: number;
}

const EPS = 1e-6;

export function checkIntegrity(p: ProjectSec): IntegrityReport {
  const errors: IntegrityIssue[] = [];
  const warnings: IntegrityIssue[] = [];

  /* duplicate IDs */
  const clipIds = new Set<string>();
  for (const c of p.clips) {
    if (clipIds.has(c.id)) {
      errors.push({
        level: "error",
        code: "DUPLICATE_CLIP_ID",
        message: `Duplicate clip id ${c.id}`,
        refs: { clipId: c.id },
      });
    }
    clipIds.add(c.id);
  }

  const trackIds = new Set<number>();
  for (const t of p.tracks) {
    if (trackIds.has(t.id)) {
      errors.push({
        level: "error",
        code: "DUPLICATE_TRACK_ID",
        message: `Duplicate track id ${t.id}`,
        refs: { trackId: t.id },
      });
    }
    trackIds.add(t.id);
  }

  const sceneIds = new Set<string>();
  for (const s of p.scenes) {
    if (sceneIds.has(s.id)) {
      errors.push({
        level: "error",
        code: "DUPLICATE_SCENE_ID",
        message: `Duplicate scene id ${s.id}`,
        refs: { sceneId: s.id },
      });
    }
    sceneIds.add(s.id);
  }

  /* track order — id must be a finite positive integer */
  for (const t of p.tracks) {
    if (!Number.isFinite(t.id) || t.id <= 0 || Math.floor(t.id) !== t.id) {
      errors.push({
        level: "error",
        code: "INVALID_TRACK_ORDER",
        message: `Track id ${t.id} must be a positive integer`,
        refs: { trackId: t.id },
      });
    }
  }

  /* per-clip checks */
  for (const c of p.clips) {
    if (!Number.isFinite(c.startTime) || !Number.isFinite(c.endTime)) {
      errors.push({
        level: "error",
        code: "INVALID_TIME",
        message: `Clip ${c.id} has non-finite time`,
        refs: { clipId: c.id },
      });
      continue;
    }
    if (c.startTime < 0) {
      errors.push({
        level: "error",
        code: "INVALID_TIME",
        message: `Clip ${c.id} has negative startTime ${c.startTime}`,
        refs: { clipId: c.id },
      });
    }
    if (!(c.endTime - c.startTime > EPS)) {
      errors.push({
        level: "error",
        code: "NEGATIVE_DURATION",
        message: `Clip ${c.id} has non-positive duration (${c.startTime} → ${c.endTime})`,
        refs: { clipId: c.id },
      });
    }
    if (!trackIds.has(c.trackId)) {
      errors.push({
        level: "error",
        code: "ORPHAN_CLIP_TRACK",
        message: `Clip ${c.id} references missing track ${c.trackId}`,
        refs: { clipId: c.id, trackId: c.trackId },
      });
    }
    if (!sceneIds.has(c.sceneId)) {
      errors.push({
        level: "error",
        code: "ORPHAN_CLIP_SCENE",
        message: `Clip ${c.id} references missing scene ${c.sceneId}`,
        refs: { clipId: c.id, sceneId: c.sceneId },
      });
    }
    if (c.transform?.opacity != null) {
      const o = c.transform.opacity;
      if (!Number.isFinite(o) || o < 0 || o > 1) {
        warnings.push({
          level: "warn",
          code: "INVALID_ZINDEX",
          message: `Clip ${c.id} opacity ${o} out of [0,1]`,
          refs: { clipId: c.id },
        });
      }
    }
  }

  /* overlap detection per (sceneId, trackId) — warning only */
  const groups = new Map<string, ClipSec[]>();
  for (const c of p.clips) {
    const k = `${c.sceneId}::${c.trackId}`;
    let arr = groups.get(k);
    if (!arr) {
      arr = [];
      groups.set(k, arr);
    }
    arr.push(c);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const cur = arr[i];
      if (cur.startTime + EPS < prev.endTime) {
        warnings.push({
          level: "warn",
          code: "OVERLAP",
          message: `Clip ${cur.id} overlaps ${prev.id} on track ${cur.trackId}`,
          refs: { clipId: cur.id, otherClipId: prev.id, trackId: cur.trackId },
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checkedAt: Date.now(),
  };
}
