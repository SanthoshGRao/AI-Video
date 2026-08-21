/**
 * Phase 0 — Legacy bridge.
 *
 * Subscribes to the existing pixel-based `useEditor` store and mirrors its
 * clips / tracks / playhead into the new time-based `useEditorCore`.
 *
 * This makes the new architecture the live source-of-truth shadow of the
 * legacy store, without requiring any change to current UI. Phase 1 will
 * flip the dependency direction (UI reads from core; legacy store retires).
 */

import { PX_PER_SECOND, type Clip as LegacyClip, type Track as LegacyTrack } from "@/lib/editor-v2/editor-data";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { migrateLegacyClip } from "./migration";
import { useEditorCore } from "./store";
import { DEFAULT_SCENE_ID, type ClipSec, type Track } from "./types";

let started = false;

function toCoreTracks(tracks: LegacyTrack[]): Track[] {
  return tracks.map((t) => ({
    id: t.id, kind: t.kind, label: t.label,
    hidden: t.hidden, muted: t.muted, locked: t.locked,
  }));
}

function toCoreClips(clips: LegacyClip[]): ClipSec[] {
  return clips.map((c) =>
    migrateLegacyClip(
      {
        id: c.id,
        kind: c.kind,
        name: c.name,
        start: c.start,
        width: c.width,
        track: c.track,
        thumb: c.thumb,
        src: c.src,
        mediaKind: c.mediaKind,
        elementId: c.elementId,
        color: c.color,
        mediaStart: c.mediaStart,
        audio: c.audio,
        playbackRate: c.playbackRate,
      },
      PX_PER_SECOND,
    ),
  );
}

function sync() {
  const legacy = useEditor.getState();
  const core = useEditorCore.getState();
  const nextClips = toCoreClips(legacy.clips);
  const nextTracks = toCoreTracks(legacy.tracks);
  // Replace project shape; do NOT route through commands (this is a mirror,
  // not user-initiated state, so it must not pollute the undo stack).
  core.loadProject({
    id: core.project.id,
    name: legacy.projectName,
    scenes: core.project.scenes.length ? core.project.scenes : [{ id: DEFAULT_SCENE_ID, name: "Main", order: 0 }],
    tracks: nextTracks,
    clips: nextClips,
  });
  if (Math.abs(core.playhead - legacy.playhead) > 1e-6) core.setPlayhead(legacy.playhead);
  if (core.playing !== legacy.playing) core.setPlaying(legacy.playing);
}

export function syncLegacyBridgeNow() {
  sync();
}

export function startLegacyBridge() {
  if (started || typeof window === "undefined") return;
  started = true;

  // Initial sync once stores are constructed.
  queueMicrotask(sync);

  // Re-sync on any legacy change to clips or tracks or projectName.
  let scheduled = false;
  useEditor.subscribe((s, prev) => {
    if (
      s.clips === prev.clips &&
      s.tracks === prev.tracks &&
      s.projectName === prev.projectName &&
      s.playing === prev.playing
    ) return;
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      sync();
    });
  });
}
