import type { Clip } from "./editor-data";
import { PX_PER_SECOND } from "./editor-data";
import type { Transition } from "./editor-store";

export function transitionWindow(tr: Transition) {
  const boundarySec = tr.start / PX_PER_SECOND;
  const halfDur = tr.duration / 2;
  return {
    boundaryPx: tr.start,
    boundarySec,
    winStart: boundarySec - halfDur,
    winEnd: boundarySec + halfDur,
  };
}

export function transitionPairAtPlayhead(
  tr: Transition,
  clips: Clip[],
  playheadSec: number,
): { outgoing: Clip; incoming: Clip; progress: number } | null {
  const { boundaryPx, winStart, winEnd } = transitionWindow(tr);
  if (playheadSec < winStart || playheadSec > winEnd) return null;

  const trackClips = clips
    .filter((c) => c.track === tr.track)
    .sort((a, b) => a.start - b.start);
  const outgoing = [...trackClips]
    .filter((c) => c.start + c.width <= boundaryPx + 2)
    .pop();
  const incoming = trackClips.find((c) => c.start >= boundaryPx - 2);
  if (!outgoing || !incoming || outgoing.id === incoming.id) return null;

  const progress = (playheadSec - winStart) / Math.max(0.001, winEnd - winStart);
  return { outgoing, incoming, progress: Math.max(0, Math.min(1, progress)) };
}

/** Clips that must be decoded during a transition overlap (even if not the track winner). */
export function transitionMediaClipsAtPlayhead(
  transitions: Transition[],
  clips: Clip[],
  playheadSec: number,
): Clip[] {
  const seen = new Set<string>();
  const out: Clip[] = [];
  for (const tr of transitions) {
    const pair = transitionPairAtPlayhead(tr, clips, playheadSec);
    if (!pair) continue;
    for (const c of [pair.outgoing, pair.incoming]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (c.kind === "video" || c.kind === "audio") out.push(c);
    }
  }
  return out;
}
