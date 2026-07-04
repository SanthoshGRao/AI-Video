/**
 * Phase 0 migration: legacy pixel-based clips → time-based clips.
 * Legacy Clip had { start: px, width: px, track: number }. We convert via PX_PER_SECOND.
 */

import { DEFAULT_SCENE_ID, type ClipAudio, type ClipSec, type ProjectSec, makeDefaultProject } from "./types";

interface LegacyClip {
  id: string;
  kind: ClipSec["kind"];
  name: string;
  start: number; // px
  width: number; // px
  track: number;
  thumb?: string;
  src?: string;
  mediaKind?: "video" | "image" | "audio";
  elementId?: string;
  color?: string;
  mediaStart?: number;
  audio?: ClipAudio;
  playbackRate?: number;
}

interface LegacyTrack {
  id: number;
  kind: ClipSec["kind"];
  label: string;
}

export function migrateLegacyClip(lc: LegacyClip, pxPerSecond: number): ClipSec {
  const startTime = lc.start / pxPerSecond;
  const endTime = (lc.start + lc.width) / pxPerSecond;
  return {
    id: lc.id,
    sceneId: DEFAULT_SCENE_ID,
    trackId: lc.track,
    kind: lc.kind,
    name: lc.name,
    startTime,
    endTime,
    mediaIn: lc.mediaStart,
    src: lc.src,
    mediaKind: lc.mediaKind,
    thumb: lc.thumb,
    color: lc.color,
    elementId: lc.elementId,
    audio: lc.audio,
    playbackRate: lc.playbackRate,
  };
}

export function migrateLegacyProject(
  legacyClips: LegacyClip[],
  legacyTracks: LegacyTrack[],
  pxPerSecond: number,
  name = "Untitled Project",
): ProjectSec {
  const p = makeDefaultProject(name);
  return {
    ...p,
    tracks: legacyTracks.length ? legacyTracks.map((t) => ({ id: t.id, kind: t.kind, label: t.label })) : p.tracks,
    clips: legacyClips.map((c) => migrateLegacyClip(c, pxPerSecond)),
  };
}
