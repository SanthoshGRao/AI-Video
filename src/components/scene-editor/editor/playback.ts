/**
 * PlaybackClock — single source of time.
 *
 * One requestAnimationFrame loop advances `currentTime` while playing.
 * Audio / video elements rendered by the preview canvas are slaved to
 * `currentTime` (via the Preview component). This guarantees zero drift
 * because every renderer reads from the same clock.
 */
import { useEffect } from "react";
import { useEditorStore } from "./store";

export function usePlaybackClock() {
  const playing = useEditorStore((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const state = useEditorStore.getState();
      const tl = state.timeline;
      if (!tl) return;
      const next = state.currentTime + dt;
      if (next >= tl.duration) {
        if (state.loop) {
          useEditorStore.setState({ currentTime: 0 });
        } else {
          useEditorStore.setState({ currentTime: tl.duration, playing: false });
          return;
        }
      } else {
        useEditorStore.setState({ currentTime: next });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}
