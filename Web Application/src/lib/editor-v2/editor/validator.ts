/**
 * Phase 1 — Timeline Validator.
 *
 * Pure, dev-only. Never crashes the editor. Returns a structured report
 * consumed by the Debug HUD.
 */

import type { ProjectSec } from "./types";

export interface ValidationIssue {
  level: "warn" | "error";
  code: string;
  message: string;
  refs?: { clipId?: string; trackId?: number; sceneId?: string };
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  checkedAt: number;
}

const EPS = 1e-6;

export function validateProject(p: ProjectSec): ValidationReport {
  const issues: ValidationIssue[] = [];

  // Duplicate IDs
  const clipIds = new Set<string>();
  for (const c of p.clips) {
    if (clipIds.has(c.id)) {
      issues.push({
        level: "error",
        code: "DUPLICATE_CLIP_ID",
        message: `Duplicate clip id: ${c.id}`,
        refs: { clipId: c.id },
      });
    }
    clipIds.add(c.id);
  }

  const trackIds = new Set<number>();
  for (const t of p.tracks) {
    if (trackIds.has(t.id)) {
      issues.push({
        level: "error",
        code: "DUPLICATE_TRACK_ID",
        message: `Duplicate track id: ${t.id}`,
        refs: { trackId: t.id },
      });
    }
    trackIds.add(t.id);
  }

  const sceneIds = new Set(p.scenes.map((s) => s.id));

  for (const c of p.clips) {
    if (!Number.isFinite(c.startTime) || !Number.isFinite(c.endTime)) {
      issues.push({
        level: "error",
        code: "INVALID_TIME",
        message: `Clip ${c.id} has non-finite time`,
        refs: { clipId: c.id },
      });
      continue;
    }
    if (!(c.endTime - c.startTime > EPS)) {
      issues.push({
        level: "error",
        code: "INVALID_DURATION",
        message: `Clip ${c.id} has non-positive duration (${c.startTime} → ${c.endTime})`,
        refs: { clipId: c.id },
      });
    }
    if (!trackIds.has(c.trackId)) {
      issues.push({
        level: "error",
        code: "ORPHAN_CLIP",
        message: `Clip ${c.id} references missing track ${c.trackId}`,
        refs: { clipId: c.id, trackId: c.trackId },
      });
    }
    if (!sceneIds.has(c.sceneId)) {
      issues.push({
        level: "error",
        code: "INVALID_SCENE_REF",
        message: `Clip ${c.id} references missing scene ${c.sceneId}`,
        refs: { clipId: c.id, sceneId: c.sceneId },
      });
    }
  }

  return {
    ok: issues.every((i) => i.level !== "error"),
    issues,
    checkedAt: Date.now(),
  };
}

/** Convenience: only run in dev. */
export function validateInDev(p: ProjectSec): ValidationReport | null {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return null;
  return validateProject(p);
}
