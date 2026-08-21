/**
 * transition-runtime.ts — THE single source of truth for what a transition
 * means in time. Preview (canvas-stage), media decoding (media-sync), the
 * canvas export (remotion/export-player) and the ffmpeg export all derive
 * their timing from here so they cannot drift apart.
 *
 * ## Model: a transition is an OVERLAP, not an effect on a cut
 *
 * A transition occupies the **last `duration` seconds of the outgoing clip**,
 * and the incoming clip **starts at that same instant** — the two clips
 * genuinely overlap on the track for the whole window:
 *
 *     [------- clip A -------]
 *                    [------- clip B -------]
 *                    |<-dur->|
 *                  start     end (= A.end = B.start + dur)
 *
 * This is the ffmpeg `xfade` convention (`offset = aEnd - duration`) and the
 * CapCut/Premiere "ripple" convention, so the exported video matches the
 * preview frame for frame.
 *
 * ### Why this replaced the old model
 *
 * Transitions used to be stored as an annotation on a *butt cut* (clips
 * touching at a single instant) with a window CENTRED on that cut
 * (`boundary ± duration/2`). Under that model:
 *
 *   - for the first half of the window the incoming clip had not started, so
 *     it had no frame to show (it got pinned to its first frame, then jumped);
 *   - for the second half the outgoing clip had already ended, so it was
 *     clamped to its last frame and paused;
 *   - so every "transition" was a live clip dissolving against a frozen still,
 *     with the roles swapping instantly at the midpoint.
 *
 * That is what produced the flicker / freeze / jump / dropped-frame symptoms.
 * The window is now derived from the clips' real positions, which also means
 * trimming or moving a clip keeps its transition correct automatically —
 * there is no stored timestamp that can go stale.
 *
 * `Transition.start` (px) is retained only as a UI hint for placing the
 * timeline badge; it is NEVER used for timing. Timing always comes from the
 * clips referenced by `clipAId` / `clipBId`.
 */

import type { Clip } from "./editor-data";
import { PX_PER_SECOND } from "./editor-data";
import type { Transition } from "./editor-store";

/** Shortest transition we allow. Below this, blending is not perceivable and
 *  ffmpeg's xfade rejects the duration outright. */
export const MIN_TRANSITION_SEC = 0.1;

export interface TransitionWindow {
  /** Timeline seconds at which the overlap begins (= incoming clip's start). */
  startSec: number;
  /** Timeline seconds at which the overlap ends (= outgoing clip's end). */
  endSec: number;
  /** Effective duration in seconds, after clamping to both clips' lengths. */
  durationSec: number;
}

function clipStartSec(c: Clip): number {
  return c.start / PX_PER_SECOND;
}

function clipEndSec(c: Clip): number {
  return (c.start + c.width) / PX_PER_SECOND;
}

function clipDurationSec(c: Clip): number {
  return c.width / PX_PER_SECOND;
}

/**
 * The largest transition the two clips can actually sustain. A transition can
 * never be longer than either clip, otherwise one of them would have to supply
 * frames from outside its own trimmed range — exactly the "clip freezes on its
 * last frame" failure this module exists to prevent.
 */
export function maxTransitionSec(outgoing: Clip, incoming: Clip): number {
  return Math.min(clipDurationSec(outgoing), clipDurationSec(incoming));
}

export function clampTransitionSec(requestedSec: number, outgoing: Clip, incoming: Clip): number {
  const max = maxTransitionSec(outgoing, incoming);
  if (max <= MIN_TRANSITION_SEC) return Math.max(0, max);
  return Math.min(Math.max(requestedSec, MIN_TRANSITION_SEC), max);
}

/** Resolve a transition's clip pair by id. Positional guessing is deliberately
 *  not used — it mis-paired clips whenever a track had more than one cut. */
export function transitionClips(
  tr: Transition,
  clips: Clip[],
): { outgoing: Clip; incoming: Clip } | null {
  const outgoing = clips.find((c) => c.id === tr.clipAId);
  const incoming = clips.find((c) => c.id === tr.clipBId);
  if (!outgoing || !incoming || outgoing.id === incoming.id) return null;
  return { outgoing, incoming };
}

/**
 * The overlap window in timeline seconds, derived from the clips themselves.
 * Returns null if the pair no longer exists (a clip was deleted) or the two
 * clips have drifted apart so far that there is no overlap left to blend.
 */
export function transitionWindow(tr: Transition, clips: Clip[]): TransitionWindow | null {
  const pair = transitionClips(tr, clips);
  if (!pair) return null;
  const { outgoing, incoming } = pair;

  const endSec = clipEndSec(outgoing);
  const durationSec = clampTransitionSec(tr.duration, outgoing, incoming);
  if (durationSec < MIN_TRANSITION_SEC) return null;

  const startSec = endSec - durationSec;

  // The incoming clip must actually cover the window. If a manual drag pulled
  // the clips apart the transition is stale, and blending against a clip that
  // is not there is precisely what used to produce black/frozen frames — so
  // report "no transition" rather than render a broken one.
  if (clipStartSec(incoming) > startSec + 1e-6) return null;
  if (clipEndSec(incoming) < endSec - 1e-6) return null;

  return { startSec, endSec, durationSec };
}

export interface TransitionPair {
  transition: Transition;
  outgoing: Clip;
  incoming: Clip;
  /** Strictly 0→1 across the window, monotonically increasing with the
   *  timeline clock. Never negative, never > 1, never derived from wall time. */
  progress: number;
  window: TransitionWindow;
}

/**
 * The active transition pair at `playheadSec`, or null.
 *
 * The window is half-open `[start, end)`: at exactly `end` the outgoing clip
 * has ended and the incoming clip owns the frame on its own, so handing back a
 * pair with progress === 1 there would render the same frame twice (the
 * duplicate-frame symptom).
 */
export function transitionPairAtPlayhead(
  tr: Transition,
  clips: Clip[],
  playheadSec: number,
): TransitionPair | null {
  const pair = transitionClips(tr, clips);
  if (!pair) return null;
  const window = transitionWindow(tr, clips);
  if (!window) return null;

  if (playheadSec < window.startSec || playheadSec >= window.endSec) return null;

  const progress = (playheadSec - window.startSec) / window.durationSec;
  return {
    transition: tr,
    outgoing: pair.outgoing,
    incoming: pair.incoming,
    progress: Math.max(0, Math.min(1, progress)),
    window,
  };
}

/** Every transition whose overlap covers `playheadSec`. */
export function activeTransitionsAtPlayhead(
  transitions: Transition[],
  clips: Clip[],
  playheadSec: number,
): TransitionPair[] {
  const out: TransitionPair[] = [];
  for (const tr of transitions) {
    const pair = transitionPairAtPlayhead(tr, clips, playheadSec);
    if (pair) out.push(pair);
  }
  return out;
}

/** Clips that must be decoded during a transition overlap (even if they are
 *  not their track's "winner"). Both sides are inside their own trimmed range
 *  for the whole window, so both can and must be decoded live. */
export function transitionMediaClipsAtPlayhead(
  transitions: Transition[],
  clips: Clip[],
  playheadSec: number,
): Clip[] {
  const seen = new Set<string>();
  const out: Clip[] = [];
  for (const pair of activeTransitionsAtPlayhead(transitions, clips, playheadSec)) {
    for (const c of [pair.outgoing, pair.incoming]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (c.kind === "video" || c.kind === "audio") out.push(c);
    }
  }
  return out;
}

/** All clip ids participating in an active transition — these must never be
 *  dropped by the single-clip-per-track resolver. */
export function transitioningClipIds(
  transitions: Transition[],
  clips: Clip[],
  playheadSec: number,
): Set<string> {
  const ids = new Set<string>();
  for (const pair of activeTransitionsAtPlayhead(transitions, clips, playheadSec)) {
    ids.add(pair.outgoing.id);
    ids.add(pair.incoming.id);
  }
  return ids;
}
