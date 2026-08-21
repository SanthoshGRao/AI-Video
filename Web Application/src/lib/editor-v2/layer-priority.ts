import type { ClipKind, TrackKind } from "./editor-data";

/**
 * Compositing stack (back → front), matching professional NLE conventions:
 *   video/image (background) → overlays → titles → subtitles (always on top)
 */
export const CLIP_LAYER_PRIORITY: Record<ClipKind, number> = {
  audio: -1,
  video: 10,
  image: 20,
  overlay: 40,
  text: 70,
  subtitle: 100,
};

export function clipLayerPriority(kind: ClipKind): number {
  return CLIP_LAYER_PRIORITY[kind] ?? 50;
}

export function clipLayerZIndex(kind: ClipKind): number {
  return clipLayerPriority(kind);
}

/** Sort for canvas paint order — lower priority clips are drawn first (behind). */
export function compareClipPaintOrder(
  a: { kind: ClipKind; track: number; start: number },
  b: { kind: ClipKind; track: number; start: number },
): number {
  const pa = clipLayerPriority(a.kind);
  const pb = clipLayerPriority(b.kind);
  if (pa !== pb) return pa - pb;
  if (a.track !== b.track) return a.track - b.track;
  return a.start - b.start;
}

/** Sort timeline rows — highest layer at the top of the track list. */
export function compareTrackDisplayOrder(
  a: { kind: TrackKind; id: number },
  b: { kind: TrackKind; id: number },
): number {
  const pa = clipLayerPriority(a.kind as ClipKind);
  const pb = clipLayerPriority(b.kind as ClipKind);
  if (pa !== pb) return pb - pa;
  return a.id - b.id;
}

export function sortTracksForDisplay<T extends { kind: TrackKind; id: number }>(tracks: T[]): T[] {
  return [...tracks].sort(compareTrackDisplayOrder);
}
