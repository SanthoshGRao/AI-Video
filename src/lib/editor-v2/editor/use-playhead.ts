/**
 * Unified playhead hook.
 *
 * The Playback Engine is the SINGLE owner of time. No component may store
 * `currentTime` in React state. Every consumer (timeline, canvas, preview,
 * debug HUD) reads through this hook.
 */

import { useSyncExternalStore } from "react";
import { playback, type PlaybackSnapshot } from "./playback";

const getServerSnapshot = (): PlaybackSnapshot => ({
  time: 0,
  playing: false,
  rate: 1,
  loop: false,
  fps: 30,
  duration: 0,
});

export function usePlayhead(): PlaybackSnapshot {
  return useSyncExternalStore(playback.subscribe, () => playback.getSnapshot(), getServerSnapshot);
}

export function usePlayheadTime(): number {
  const snap = usePlayhead();
  return snap.time;
}
