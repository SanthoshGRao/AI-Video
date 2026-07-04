/**
 * AudioPlayer — invisible <audio> elements slaved to the playback clock.
 * One element per audio clip; on every clock tick we reconcile play/pause
 * and re-seek when drift exceeds 150ms.
 */
import { useEffect, useRef } from "react";
import { useEditorStore } from "../store";
import type { AudioClip } from "../schema";

export function AudioPlayer() {
  const timeline = useEditorStore((s) => s.timeline);
  const bundle = useEditorStore((s) => s.bundle);
  const playing = useEditorStore((s) => s.playing);
  const currentTime = useEditorStore((s) => s.currentTime);
  const muted = useEditorStore((s) => s.muted);
  const masterVolume = useEditorStore((s) => s.volume);

  const elsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Lifecycle: create/destroy <audio> tags as clips appear/disappear
  useEffect(() => {
    if (!timeline || !bundle) return;
    const audioClips = timeline.clips.filter(
      (c): c is AudioClip => c.kind === "audio",
    );
    const seen = new Set<string>();
    for (const c of audioClips) {
      seen.add(c.id);
      const asset =
        c.role === "voiceover"
          ? bundle.audioAsset
          : bundle.mediaAssets.find((m) => m.id === c.assetId);
      if (!asset || !("url" in asset) || !asset.url) continue;
      let el = elsRef.current.get(c.id);
      if (!el) {
        el = new Audio(asset.url);
        el.preload = "auto";
        el.crossOrigin = "anonymous";
        elsRef.current.set(c.id, el);
      }
    }
    for (const [id, el] of elsRef.current.entries()) {
      if (!seen.has(id)) {
        el.pause();
        elsRef.current.delete(id);
      }
    }
  }, [timeline, bundle]);

  // Reconcile playback on every relevant change
  useEffect(() => {
    if (!timeline) return;
    const audioClips = timeline.clips.filter(
      (c): c is AudioClip => c.kind === "audio",
    );
    for (const c of audioClips) {
      const el = elsRef.current.get(c.id);
      if (!el) continue;
      const track = timeline.tracks.find((t) => t.id === c.trackId);
      const trackMuted = track?.muted || c.hidden;
      const within = currentTime >= c.start && currentTime < c.start + c.duration;
      el.muted = muted || Boolean(trackMuted);
      el.volume = Math.max(0, Math.min(1, c.volume * masterVolume));
      if (within) {
        const localTime = currentTime - c.start + (c.inPoint ?? 0);
        if (Math.abs(el.currentTime - localTime) > 0.15) {
          try {
            el.currentTime = localTime;
          } catch {
            /* seeking before metadata loaded */
          }
        }
        if (playing && el.paused) el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
      } else if (!el.paused) {
        el.pause();
      }
    }
  }, [playing, currentTime, timeline, muted, masterVolume]);

  return null;
}
