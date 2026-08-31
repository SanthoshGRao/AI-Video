/**
 * subtitle-sync.ts — keeps the timeline's subtitle clips and each
 * SubtitleTrack's `cues` in sync for the native editor.
 *
 * Subtitles have two representations that can drift: `subtitle_tracks.cues`
 * (what TTS/alignment writes, and what export's ASS burn-in reads directly)
 * and per-cue "subtitle" clips on the timeline (what the editor shows and
 * lets you edit). Nothing kept them in sync — a project's very first
 * Timeline row is built by a different pipeline (the Web Application's
 * OpenCut project initializer) that routes every subtitle element into a
 * dead `textLayers` array instead of `clips`, so the "Subtitles" track
 * starts out with no clips at all, and regenerating a script/voiceover
 * later has nothing to push the new cues into either.
 *
 * Cues are treated as the source of truth here: on every load, subtitle
 * clips are rebuilt fresh from the current cues (so a script change made
 * outside the editor shows up next time the project is opened). On every
 * save, edits made to a subtitle clip (text or retiming) are folded back
 * into its track's cues, so the change also reaches the exported video.
 */
import type { NativeClip, NativeProject, NativeTrack } from "./types";
import type { SubtitleTrackRow } from "../data/types";

export interface SubtitleCueLike {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words?: { word: string; startMs: number; endMs: number }[];
}

function isCueLike(v: unknown): v is SubtitleCueLike {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.id === "string" && typeof c.startMs === "number" && typeof c.endMs === "number" && typeof c.text === "string";
}

function parseCues(raw: unknown): SubtitleCueLike[] {
  return Array.isArray(raw) ? raw.filter(isCueLike) : [];
}

function ensureSubtitleTrack(project: NativeProject): NativeTrack {
  const existing = project.tracks.find((t) => t.kind === "subtitle");
  if (existing) return existing;
  const track: NativeTrack = {
    id: "track-subtitle",
    kind: "subtitle",
    name: "Subtitles",
    order: project.tracks.length,
    muted: false,
    locked: false,
    hidden: false,
  };
  project.tracks.push(track);
  return track;
}

/** Replaces every "subtitle"-kind clip in `project` with a fresh set built
 * from `tracks`' current cues. Mutates `project` in place. */
export function syncSubtitleClipsFromCues(project: NativeProject, tracks: SubtitleTrackRow[]): void {
  project.clips = project.clips.filter((c) => c.kind !== "subtitle");
  if (tracks.length === 0) return;

  const track = ensureSubtitleTrack(project);
  for (const subtitleTrack of tracks) {
    const cues = parseCues(subtitleTrack.cues);
    const style = (subtitleTrack.customStyle as Record<string, unknown> | null) ?? {};
    for (const cue of cues) {
      const clip: NativeClip = {
        id: cue.id,
        trackId: track.id,
        kind: "subtitle",
        startSec: cue.startMs / 1000,
        endSec: cue.endMs / 1000,
        subtitleTrackId: subtitleTrack.id,
        cueId: cue.id,
        effects: [],
        text: { content: cue.text, style },
        raw: cue.words ? { words: cue.words } : {},
      };
      project.clips.push(clip);
    }
  }
}

/** Folds subtitle-clip edits (text and/or retiming) back into each affected
 * SubtitleTrack's cues. Returns subtitleTrackId -> its full updated cue
 * list, for the caller to persist via updateSubtitleTrackCues(). */
export function collectSubtitleCueUpdates(project: NativeProject): Map<string, SubtitleCueLike[]> {
  const bySubtitleTrack = new Map<string, NativeClip[]>();
  for (const clip of project.clips) {
    if (clip.kind !== "subtitle" || !clip.subtitleTrackId) continue;
    const list = bySubtitleTrack.get(clip.subtitleTrackId) ?? [];
    list.push(clip);
    bySubtitleTrack.set(clip.subtitleTrackId, list);
  }

  const out = new Map<string, SubtitleCueLike[]>();
  for (const [subtitleTrackId, clips] of bySubtitleTrack) {
    clips.sort((a, b) => a.startSec - b.startSec);
    out.set(
      subtitleTrackId,
      clips.map((clip) => ({
        id: clip.cueId ?? clip.id,
        startMs: Math.round(clip.startSec * 1000),
        endMs: Math.round(clip.endSec * 1000),
        text: clip.text?.content ?? "",
        words: Array.isArray(clip.raw?.words) ? (clip.raw!.words as SubtitleCueLike["words"]) : undefined,
      }))
    );
  }
  return out;
}
