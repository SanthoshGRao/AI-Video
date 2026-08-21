/**
 * Phase 1 — Media Sync Controller.
 *
 *   Playback Engine → Media Sync Controller → Media Pool
 *
 * Responsibilities:
 *   - preseek when playhead approaches a clip
 *   - prebuffer (rely on <video preload="auto">)
 *   - drift correction during playback
 *   - visibility updates (active vs inactive)
 *   - SOLE owner of <audio>/<video>.volume / .muted (per-clip mixer)
 *
 * The Future Audio Engine plugs into the same controller.
 */

import { playback } from "./playback";
import { mediaPool, type MediaKind } from "./media-pool";
import type { ClipSec, ProjectSec } from "./types";
import { resolveScene } from "./selectors";
import { resolveAssetId } from "./render-pipeline-debug";
import { useEditor } from "../editor-store";
import { PX_PER_SECOND } from "../editor-data";
import { activeTransitionsAtPlayhead, transitionMediaClipsAtPlayhead } from "../transition-runtime";

const DRIFT_TOLERANCE = 0.35; // seconds — above this we hard-seek the media
const PRESEEK_LOOKAHEAD = 0.5; // seconds — start preparing media within this window

interface RuntimeState {
  project: ProjectSec | null;
  sceneId: string | null;
}

const state: RuntimeState = { project: null, sceneId: null };
let unsub: (() => void) | null = null;
/** Last set of ids we drove this tick; surfaced to the Debug HUD. */
const lastActiveAudioIds = new Set<string>();
const lastAttachedMediaIds = new Set<string>();

function localTime(clip: ClipSec, currentTime: number): number {
  return (currentTime - clip.startTime) * (clip.playbackRate ?? 1) + (clip.mediaIn ?? 0);
}

/**
 * Resolve the audible volume for `clip` (0..2). Returns 0 when muted or when
 * another clip is solo'd. Applies linear fade in/out for audio clips.
 */
function effectiveVolume(
  clip: ClipSec,
  currentTime: number,
  hasSolo: boolean,
  track?: { muted?: boolean; volume?: number; hidden?: boolean },
): number {
  const a = clip.audio ?? {};
  if (a.muted) return 0;
  if (track?.muted) return 0;
  if (hasSolo && !a.solo) return 0;
  let vol = a.volume == null ? 1 : Math.max(0, Math.min(2, a.volume));
  if (track?.volume != null) vol *= Math.max(0, Math.min(2, track.volume));
  const dur = clip.endTime - clip.startTime;
  if (a.fadeIn && a.fadeIn > 0) {
    const t = currentTime - clip.startTime;
    if (t < a.fadeIn) vol *= Math.max(0, t / a.fadeIn);
  }
  if (a.fadeOut && a.fadeOut > 0) {
    const t = clip.endTime - currentTime;
    if (t < a.fadeOut && dur > 0) vol *= Math.max(0, t / a.fadeOut);
  }
  return vol;
}

function syncTick(currentTime: number) {
  const { project, sceneId } = state;
  if (!project || !sceneId) return;
  const active = resolveScene(project, sceneId, currentTime);
  const playing = playback.isPlaying();
  const keep = new Set<string>();
  const activeMediaIds = new Set<string>();
  lastActiveAudioIds.clear();

  // Detect any solo across audible clips so we can mute the rest.
  const hasSolo = project.clips.some(
    (c) => (c.kind === "audio" || c.kind === "video") && c.audio?.solo,
  );

  const legacy = useEditor.getState();

  /**
   * Audio crossfade gains for clips inside a transition.
   *
   * Because a transition is a real overlap, the incoming clip becomes its
   * track's "winner" the moment the overlap starts — so without this the
   * outgoing clip's audio would cut out a whole transition-duration early.
   * Both sides stay audible and crossfade on the same 0→1 curve the picture
   * uses, which is what an NLE does at a dissolve.
   */
  const transitionGain = new Map<string, number>();
  for (const pair of activeTransitionsAtPlayhead(legacy.transitions, legacy.clips, currentTime)) {
    const out = 1 - pair.progress;
    const inc = pair.progress;
    transitionGain.set(pair.outgoing.id, Math.min(transitionGain.get(pair.outgoing.id) ?? 1, out));
    transitionGain.set(pair.incoming.id, Math.min(transitionGain.get(pair.incoming.id) ?? 1, inc));
  }

  for (const item of active) {
    const clip = item.clip;
    if (clip.kind !== "video" && clip.kind !== "audio") continue;
    if (!clip.src) continue;
    const kind: MediaKind = clip.kind === "video" ? "video" : "audio";
    const el = mediaPool.acquire(clip.id, kind, clip.src);
    if (!el) continue;
    keep.add(clip.id);
    activeMediaIds.add(clip.id);
    if (!lastAttachedMediaIds.has(clip.id)) {
      // ATTACH log silenced
    }

    const track = project.tracks.find((t) => t.id === clip.trackId);
    const vol = effectiveVolume(clip, currentTime, hasSolo, track) * (transitionGain.get(clip.id) ?? 1);
    const globalMuted = legacy.globalMuted;
    // The mixer is the SINGLE writer of volume/muted. No other component
    // may touch these properties — that's how we avoid double audio.
    try {
      el.volume = Math.min(1, vol); // HTMLMediaElement clamps to [0,1]
      el.muted = globalMuted || vol <= 0;
      el.playbackRate = clip.playbackRate ?? 1;
    } catch {
      /* noop */
    }
    if (vol > 0) lastActiveAudioIds.add(clip.id);

    const target = Math.max(0, localTime(clip, currentTime));
    const drift = Math.abs(el.currentTime - target);

    if (!playing) {
      if (drift > 0.01) {
        try {
          el.currentTime = target;
        } catch {
          /* noop */
        }
      }
      if (!el.paused) el.pause();
      // PAUSE log silenced
    } else {
      if (drift > DRIFT_TOLERANCE) {
        try {
          el.currentTime = target;
        } catch {
          /* noop */
        }
      }
      if (el.paused) {
        const tryPlay = () => {
          const p = el.play();
          if (p && typeof p.catch === "function") p.catch(() => void 0);
        };
        if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          tryPlay();
        } else {
          const onReady = () => {
            el.removeEventListener("canplay", onReady);
            tryPlay();
          };
          el.addEventListener("canplay", onReady);
        }
      }
    }
  }

  // Both sides of an active transition must decode LIVE and simultaneously.
  //
  // A transition is a real overlap now (see transition-runtime.ts), so for the
  // whole window both clips are inside their own trimmed range and both have a
  // genuine frame at `currentTime`. This block used to freeze and pause
  // whichever clip "didn't own the instant" — under the old butt-cut model it
  // had no choice, because one side was always outside its own range. That is
  // what made every transition a live clip dissolving against a still, with the
  // two swapping roles instantly at the midpoint (the "jump"/"flicker").
  for (const clip of transitionMediaClipsAtPlayhead(legacy.transitions, legacy.clips, currentTime)) {
    if (!clip.src) continue;
    // Already fully driven by the mixer loop above, which is the SINGLE writer
    // of volume/muted — touching it again here would fight over the element.
    if (activeMediaIds.has(clip.id)) continue;
    const kind: MediaKind = clip.kind === "video" ? "video" : "audio";
    const el = mediaPool.acquire(clip.id, kind, clip.src);
    if (!el) continue;
    keep.add(clip.id);
    const clipStartSec = clip.start / PX_PER_SECOND;
    const clipEndSec = (clip.start + clip.width) / PX_PER_SECOND;
    const rawTarget = (currentTime - clipStartSec) * (clip.playbackRate ?? 1) + (clip.mediaStart ?? 0);
    // Still clamped, but now purely as a safety rail against a stale/dragged
    // transition — in the normal case rawTarget is already inside the range.
    const maxTarget = Math.max(0, (clipEndSec - clipStartSec) * (clip.playbackRate ?? 1) + (clip.mediaStart ?? 0));
    const target = Math.max(0, Math.min(rawTarget, maxTarget));
    try {
      // While playing, only correct real drift — re-seeking a playing element
      // every tick restarts its decoder and drops frames. While paused
      // (scrubbing), seek precisely so the preview is frame-accurate.
      const tolerance = playing ? DRIFT_TOLERANCE : 0.01;
      if (Math.abs(el.currentTime - target) > tolerance) el.currentTime = target;
      el.playbackRate = clip.playbackRate ?? 1;
    } catch {
      /* noop */
    }
    // Audio for the transition partner, on the same crossfade curve as the
    // picture. Hard-muting it here (what this used to do) meant the outgoing
    // clip's audio dropped out the instant the overlap began.
    const clipSec = project.clips.find((c) => c.id === clip.id);
    const track = clipSec ? project.tracks.find((t) => t.id === clipSec.trackId) : undefined;
    const vol = clipSec
      ? effectiveVolume(clipSec, currentTime, hasSolo, track) * (transitionGain.get(clip.id) ?? 1)
      : 0;
    try {
      el.volume = Math.min(1, Math.max(0, vol));
      el.muted = legacy.globalMuted || vol <= 0;
    } catch {
      /* noop */
    }
    if (vol > 0) lastActiveAudioIds.add(clip.id);
    if (playing) {
      if (el.paused) {
        const p = el.play();
        if (p && typeof p.catch === "function") p.catch(() => void 0);
      }
    } else if (!el.paused) {
      el.pause();
    }
  }

  // Preseek upcoming clips
  for (const clip of project.clips) {
    if (clip.sceneId !== sceneId) continue;
    if (keep.has(clip.id)) continue;
    if (clip.kind !== "video" && clip.kind !== "audio") continue;
    if (!clip.src) continue;
    const lead = clip.startTime - currentTime;
    if (lead > 0 && lead <= PRESEEK_LOOKAHEAD) {
      const kind: MediaKind = clip.kind === "video" ? "video" : "audio";
      const el = mediaPool.acquire(clip.id, kind, clip.src);
      keep.add(clip.id);
      if (el) {
        try {
          el.currentTime = clip.mediaIn ?? 0;
          el.muted = true; // stay silent until the clip becomes active
        } catch {
          /* noop */
        }
        if (!el.paused) el.pause();
      }
    }
  }

  // Pause everything else; GC anything outside the keep window
  for (const [id, entry] of mediaPool.all()) {
    if (!keep.has(id)) {
      try {
        entry.el.muted = true;
      } catch {
        /* noop */
      }
      if (!entry.el.paused) {
        entry.el.pause();
        // PAUSE log silenced
      }
      // DETACH log silenced
      mediaPool.release(id);
      lastAttachedMediaIds.delete(id);
    }
  }
  for (const id of Array.from(lastAttachedMediaIds)) {
    if (!activeMediaIds.has(id)) lastAttachedMediaIds.delete(id);
  }
  for (const id of activeMediaIds) lastAttachedMediaIds.add(id);
}

export const mediaSync = {
  attach(project: ProjectSec, sceneId: string) {
    state.project = project;
    state.sceneId = sceneId;
    if (!unsub) {
      unsub = playback.onTick((t) => syncTick(t));
      syncTick(playback.getTime());
    } else {
      syncTick(playback.getTime());
    }
  },
  update(project: ProjectSec, sceneId: string) {
    state.project = project;
    state.sceneId = sceneId;
    syncTick(playback.getTime());
  },
  detach() {
    if (unsub) {
      unsub();
      unsub = null;
    }
    state.project = null;
    state.sceneId = null;
    mediaPool.gc(new Set());
    lastActiveAudioIds.clear();
    lastAttachedMediaIds.clear();
  },
  stats() {
    return {
      poolSize: mediaPool.size(),
      activeAudioIds: Array.from(lastActiveAudioIds),
    };
  },
};
