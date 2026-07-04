import type { EditorElement } from "@/lib/editor/types";

/** Compare media URLs (relative vs absolute). */
export function sameMediaUrl(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return a === b;
  if (a === b) return true;
  if (typeof window === "undefined") return a === b;
  try {
    return (
      new URL(a, window.location.origin).href ===
      new URL(b, window.location.origin).href
    );
  } catch {
    return a === b;
  }
}

export function getClipsAtPlayhead(
  elements: EditorElement[],
  playheadMs: number
): EditorElement[] {
  return elements
    .filter(
      (e) =>
        e.visible !== false &&
        e.type !== "audio" &&
        e.type !== "subtitle" &&
        e.mediaUrl &&
        playheadMs >= e.startMs &&
        playheadMs < e.endMs
    )
    .sort((a, b) => a.trackIndex - b.trackIndex);
}

export function getActiveVideoClip(
  elements: EditorElement[],
  playheadMs: number
): EditorElement | null {
  const videos = elements
    .filter(
      (e) =>
        e.type === "video" &&
        e.visible !== false &&
        e.mediaUrl &&
        playheadMs >= e.startMs &&
        playheadMs < e.endMs
    )
    .sort((a, b) => b.trackIndex - a.trackIndex);
  return videos[0] ?? null;
}

export function clipLocalSeconds(
  clip: EditorElement | null,
  playheadMs: number
): number {
  if (!clip) return 0;
  return Math.max(0, (playheadMs - clip.startMs) / 1000);
}

export function formatTimeShort(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
