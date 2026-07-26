/**
 * transitions.ts — transition pairing/progress math, kept deliberately
 * consistent with the export side's xfade offset calculation
 * (Desktop Application/src/editor/export/filtergraph-builder.ts:
 * `offset = max(0, aDur - transition.durationSec)`, measured from clipA's
 * own start) so preview and export show the SAME transition window rather
 * than drifting apart — the concrete "preview and exported video sometimes
 * do not match" bug this whole redesign exists to fix.
 *
 * Window convention: a transition occupies the last `durationSec` of the
 * outgoing (from) clip, ending exactly at that clip's endSec. The
 * incoming (to) clip is expected to start at or before that same point
 * (typically clipB.startSec === clipA.endSec - durationSec, the standard
 * "drag a transition onto a cut" gesture) — the window itself is derived
 * only from clipA + the transition's own duration, not from clipB's
 * position, so it's well-defined even if the UI doesn't perfectly enforce
 * that overlap invariant.
 */

import type { NativeClip, NativeProject, NativeTransition } from "../../../src/editor/model/types";

export interface TransitionPair {
  transition: NativeTransition;
  outgoing: NativeClip;
  incoming: NativeClip;
  /** 0..1 within the transition window. */
  progress: number;
}

export function transitionWindow(transition: NativeTransition, outgoing: NativeClip): { start: number; end: number } {
  const end = outgoing.endSec;
  const start = Math.max(outgoing.startSec, end - transition.durationSec);
  return { start, end };
}

/** Returns the active transition pair at `playheadSec`, if any. */
export function transitionAtPlayhead(project: NativeProject, playheadSec: number): TransitionPair | null {
  for (const transition of project.transitions) {
    const outgoing = project.clips.find((c) => c.id === transition.fromClipId);
    const incoming = project.clips.find((c) => c.id === transition.toClipId);
    if (!outgoing || !incoming) continue;

    const { start, end } = transitionWindow(transition, outgoing);
    if (playheadSec < start || playheadSec > end) continue;

    const progress = end > start ? (playheadSec - start) / (end - start) : 1;
    return { transition, outgoing, incoming, progress: Math.max(0, Math.min(1, progress)) };
  }
  return null;
}

/** Clip ids currently inside an active transition window at `playheadSec` —
 * these need both textures decoded/composited simultaneously. */
export function transitioningClipIds(project: NativeProject, playheadSec: number): Set<string> {
  const pair = transitionAtPlayhead(project, playheadSec);
  if (!pair) return new Set();
  return new Set([pair.outgoing.id, pair.incoming.id]);
}
