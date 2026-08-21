/**
 * Phase 2 — Magnetic snapping.
 *
 * Pure helpers — given the project, playhead, markers, and the desired time,
 * return the snapped time + a guide describing what we snapped to.
 *
 * Threshold is supplied in pixels and converted via pxPerSecond so snap
 * "feel" stays constant across zoom levels.
 */

import type { ProjectSec } from "./types";
import type { Marker, SnapGuide } from "./timeline-ui-store";

export interface SnapInput {
  project: ProjectSec;
  sceneId: string;
  playhead: number;
  markers: Marker[];
  thresholdPx: number;
  pxPerSecond: number;
  /** Clip ids to exclude (e.g. the clip being dragged). */
  exclude?: Set<string>;
}

interface Candidate {
  time: number;
  source: SnapGuide["source"];
  refId?: string;
}

function gatherCandidates(input: SnapInput): Candidate[] {
  const out: Candidate[] = [{ time: input.playhead, source: "playhead" }];
  for (const m of input.markers) out.push({ time: m.time, source: "marker", refId: m.id });
  for (const c of input.project.clips) {
    if (c.sceneId !== input.sceneId) continue;
    if (input.exclude?.has(c.id)) continue;
    out.push({ time: c.startTime, source: "clip-start", refId: c.id });
    out.push({ time: c.endTime, source: "clip-end", refId: c.id });
  }
  return out;
}

export interface SnapResult {
  time: number;
  guide: SnapGuide | null;
  snapped: boolean;
}

export function snapTime(desired: number, input: SnapInput): SnapResult {
  const thresholdSec = input.thresholdPx / Math.max(1e-3, input.pxPerSecond);
  let best: Candidate | null = null;
  let bestDist = thresholdSec;
  for (const c of gatherCandidates(input)) {
    const d = Math.abs(c.time - desired);
    if (d <= bestDist) {
      best = c;
      bestDist = d;
    }
  }
  if (!best) return { time: desired, guide: null, snapped: false };
  return {
    time: best.time,
    guide: { time: best.time, source: best.source, refId: best.refId },
    snapped: true,
  };
}
