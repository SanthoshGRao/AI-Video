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
import { transitionMediaClipsAtPlayhead } from "../transition-runtime";

const DRIFT_TOLERANCE = 0.08; // seconds — above this we hard-seek the media
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
    const vol = effectiveVolume(clip, currentTime, hasSolo, track);
    const globalMuted = useEditor.getState().globalMuted;
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

  // Preload both sides of an active transition so canvas crossfades aren't black.
  const legacy = useEditor.getState();
  for (const clip of transitionMediaClipsAtPlayhead(legacy.transitions, legacy.clips, currentTime)) {
    if (!clip.src) continue;
    const kind: MediaKind = clip.kind === "video" ? "video" : "audio";
    const el = mediaPool.acquire(clip.id, kind, clip.src);
    if (!el) continue;
    keep.add(clip.id);
    const clipStartSec = clip.start / PX_PER_SECOND;
    const clipEndSec = (clip.start + clip.width) / PX_PER_SECOND;
    // Clamp the seek target to the clip's own content. Seeking a video element
    // PAST its end every frame (which happens for the outgoing clip during the
    // second half of a transition) is what makes playback stutter — instead we
    // freeze it on its last frame and keep it paused so the crossfade is clean.
    const withinOwnWindow = currentTime >= clipStartSec && currentTime < clipEndSec;
    const rawTarget = (currentTime - clipStartSec) * (clip.playbackRate ?? 1) + (clip.mediaStart ?? 0);
    const maxTarget = Math.max(0, (clipEndSec - clipStartSec) * (clip.playbackRate ?? 1) + (clip.mediaStart ?? 0) - 0.05);
    const target = Math.max(0, Math.min(rawTarget, maxTarget));
    try {
      if (Math.abs(el.currentTime - target) > 0.04) el.currentTime = target;
      el.playbackRate = clip.playbackRate ?? 1;
    } catch {
      /* noop */
    }
    if (kind === "video") {
      try {
        el.muted = true;
      } catch {
        /* noop */
      }
    }
    // Only the clip that actually owns this instant should be playing; the other
    // side of the transition stays frozen so two videos don't fight the clock.
    if ((!playing || !withinOwnWindow) && !el.paused) el.pause();
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
