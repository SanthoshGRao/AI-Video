/**
 * Keyframe interpolation. Linear for v1, with ease curves wired in.
 */
import type { Clip, Keyframe } from "./schema";

function ease(t: number, kind: Keyframe["ease"]): number {
  switch (kind) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return t * (2 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default:
      return t;
  }
}

export function sampleKeyframes(
  kfs: Keyframe[],
  localTime: number,
  fallback: number,
): number {
  if (kfs.length === 0) return fallback;
  if (kfs.length === 1) return kfs[0].v;
  if (localTime <= kfs[0].t) return kfs[0].v;
  if (localTime >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (localTime >= a.t && localTime <= b.t) {
      const span = b.t - a.t || 1;
      const u = ease((localTime - a.t) / span, b.ease);
      return a.v + (b.v - a.v) * u;
    }
  }
  return fallback;
}

export function clipPropertyAt(
  clip: Clip,
  prop: "x" | "y" | "scale" | "rotation" | "opacity",
  timelineTime: number,
  fallback: number,
): number {
  const local = timelineTime - clip.start;
  if (local < 0 || local > clip.duration) return fallback;
  return sampleKeyframes(clip.keyframes[prop], local, fallback);
}
