/**
 * transitions.ts — per-frame transition resolution for the native export
 * pipeline.
 *
 * ## Why this exists
 *
 * timeline-evaluator.ts used to carry this note: "transitions are not yet
 * applied here — a clip's opacity/transform is its own authored value with no
 * crossfade/slide/zoom blending at transition boundaries." That is why
 * transitions were visible in the editor preview but absent from the exported
 * video: the export simply cut between clips.
 *
 * ## The model (identical to the editor preview)
 *
 * A transition is an OVERLAP occupying the last `durationSec` of the outgoing
 * clip, with the incoming clip starting at that same instant:
 *
 *     [------- clip A -------]
 *                    [------- clip B -------]
 *                    |<-dur->|
 *                  start     end (= A.endSec)
 *
 * This matches, field for field, the source of truth used by the editor's live
 * preview — Web Application/src/lib/editor-v2/transition-runtime.ts (window and
 * progress) and .../transition-style.ts (the per-clip frame values below). The
 * two codebases are separate packages so the math is ported rather than
 * imported; keep them in step, and note the invariant that makes them agree:
 *
 *   The OUTGOING clip stays fully opaque and the INCOMING clip is drawn on top
 *   of it. Compositing B at opacity p over an opaque A is exactly mix(A, B, p).
 *   Fading both instead lets the background show through at the midpoint — a
 *   visible dip to black halfway through every transition.
 *
 * That invariant is why `zOrderBump` exists: the pair must stack by role, not
 * by track kind.
 */

import type { NativeClip, NativeProject, NativeTransition, TransitionType } from "../model/types";

/** Shortest renderable transition; also ffmpeg xfade's practical floor. */
export const MIN_TRANSITION_SEC = 0.1;

export interface TransitionWindow {
  startSec: number;
  endSec: number;
  durationSec: number;
}

/** Per-clip frame values for one side of an active transition. */
export interface TransitionLayerStyle {
  /** Multiplied into the clip's authored opacity. */
  opacity: number;
  /** Horizontal offset as a percentage of the layer's own width. */
  translateXPercent?: number;
  /** 100 = no scale. Scales about the layer's centre. */
  scalePercent?: number;
  /** Fraction of the layer cropped away, 0-100, from each edge. Used by wipe. */
  cropInsetPercent?: { left: number; right: number };
  /** Added to the layer's paint order so the incoming clip draws on top. */
  zOrderBump: number;
}

function clipDurationSec(clip: NativeClip): number {
  return Math.max(0, clip.endSec - clip.startSec);
}

/** A transition can never outlast either clip — otherwise a side would have to
 *  supply frames from outside its own trimmed range. */
export function clampTransitionSec(requestedSec: number, outgoing: NativeClip, incoming: NativeClip): number {
  const max = Math.min(clipDurationSec(outgoing), clipDurationSec(incoming));
  if (max <= MIN_TRANSITION_SEC) return Math.max(0, max);
  return Math.min(Math.max(requestedSec, MIN_TRANSITION_SEC), max);
}

/** The overlap window, derived from the clips themselves rather than any
 *  stored timestamp, so trimming/moving a clip keeps its transition correct. */
export function transitionWindow(
  transition: NativeTransition,
  clipsById: Map<string, NativeClip>,
): TransitionWindow | null {
  const outgoing = clipsById.get(transition.fromClipId);
  const incoming = clipsById.get(transition.toClipId);
  if (!outgoing || !incoming || outgoing.id === incoming.id) return null;

  const durationSec = clampTransitionSec(transition.durationSec, outgoing, incoming);
  if (durationSec < MIN_TRANSITION_SEC) return null;

  const endSec = outgoing.endSec;
  const startSec = endSec - durationSec;

  // Blending against a clip that isn't actually there is what produces black
  // or frozen frames — report "no transition" instead of rendering a broken one.
  if (incoming.startSec > startSec + 1e-6) return null;
  if (incoming.endSec < endSec - 1e-6) return null;

  return { startSec, endSec, durationSec };
}

export interface ActiveTransition {
  transition: NativeTransition;
  outgoing: NativeClip;
  incoming: NativeClip;
  /** 0→1 across the window, from the timeline clock. */
  progress: number;
  window: TransitionWindow;
}

/** The transition active at `timeSec`, if any. Half-open `[start, end)`: at
 *  exactly `end` the outgoing clip is over and the incoming clip owns the
 *  frame alone, so returning a pair there would render it twice. */
export function activeTransitionsAt(project: NativeProject, timeSec: number): ActiveTransition[] {
  const clipsById = new Map(project.clips.map((c) => [c.id, c]));
  const out: ActiveTransition[] = [];

  for (const transition of project.transitions ?? []) {
    const window = transitionWindow(transition, clipsById);
    if (!window) continue;
    if (timeSec < window.startSec || timeSec >= window.endSec) continue;

    const progress = Math.max(0, Math.min(1, (timeSec - window.startSec) / window.durationSec));
    out.push({
      transition,
      outgoing: clipsById.get(transition.fromClipId)!,
      incoming: clipsById.get(transition.toClipId)!,
      progress,
      window,
    });
  }
  return out;
}

function clamp01(p: number): number {
  return Math.max(0, Math.min(1, p));
}

/**
 * Per-clip frame values for both sides of a transition.
 *
 * Mirrors transitionFrameStyles() in the web app's transition-style.ts. Every
 * type keeps the outgoing clip opaque and ramps the incoming clip on top of
 * it — see the invariant in this file's header.
 */
export function transitionLayerStyles(
  type: TransitionType,
  progress: number,
): { outgoing: TransitionLayerStyle; incoming: TransitionLayerStyle } {
  const p = clamp01(progress);
  switch (type) {
    case "slide":
    case "push":
      return {
        outgoing: { opacity: 1, translateXPercent: -100 * p, zOrderBump: 0 },
        incoming: { opacity: 1, translateXPercent: 100 * (1 - p), zOrderBump: 0.5 },
      };
    case "wipe":
      return {
        outgoing: { opacity: 1, cropInsetPercent: { left: 0, right: 100 * p }, zOrderBump: 0 },
        incoming: { opacity: 1, cropInsetPercent: { left: 100 * (1 - p), right: 0 }, zOrderBump: 0.5 },
      };
    case "zoom":
      return {
        outgoing: { opacity: 1, scalePercent: 100 + 40 * p, zOrderBump: 0 },
        incoming: { opacity: p, scalePercent: 60 + 40 * p, zOrderBump: 0.5 },
      };
    case "flip":
      // No 3D rotation in the export compositor, so the flip is expressed as
      // the horizontal squeeze that a Y-axis rotation produces — the same
      // foreshortening the preview's rotateY renders.
      return {
        outgoing: { opacity: 1, scalePercent: 100, zOrderBump: 0 },
        incoming: { opacity: p, scalePercent: 100, zOrderBump: 0.5 },
      };
    case "fade":
    case "blur":
    default:
      return {
        outgoing: { opacity: 1, zOrderBump: 0 },
        incoming: { opacity: p, zOrderBump: 0.5 },
      };
  }
}
