import { useEffect, useMemo, useRef } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { GlCompositor, type FrameSources, type FrameSourceEntry } from "../gl/compositor";

/**
 * Phase 2 preview: real GPU compositing via WebGL2 (gl/compositor.ts)
 * replaces the Phase 1 DOM/CSS stage. Decode still happens through pooled
 * <video>/<img> elements (Chromium already hardware-decodes these) — they
 * stay off-screen here and are only used as texture upload sources; all
 * positioning/effects/transitions/text now run as GPU shader passes.
 */
export function CanvasStage() {
  const { timeline, media, selectClip } = useProjectStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<GlCompositor | null>(null);
  const videoElsRef = useRef(new Map<string, HTMLVideoElement>());
  const imageElsRef = useRef(new Map<string, HTMLImageElement>());
  const rafRef = useRef<number | null>(null);

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);

  useEffect(() => {
    if (!canvasRef.current || !timeline) return;
    const compositor = new GlCompositor(canvasRef.current);
    compositorRef.current = compositor;
    return () => {
      compositor.dispose();
      compositorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!timeline]);

  // Keep one hidden <video>/<img> element alive per clip within a small
  // window of the playhead (current + lookahead), matching the old
  // pre-seek approach — decode only needs to happen for clips that might
  // actually be sampled this frame or very soon.
  useEffect(() => {
    if (!timeline) return;
    const id = window.setInterval(syncMediaElements, 250);
    syncMediaElements();
    return () => window.clearInterval(id);

    function syncMediaElements() {
      const state = useProjectStore.getState();
      const t = state.timeline;
      if (!t) return;
      const playhead = state.playheadSec;
      const nearby = t.clips.filter((c) => c.startSec - 1 <= playhead && playhead <= c.endSec + 1 && c.kind !== "audio");
      const nearbyIds = new Set(nearby.map((c) => c.id));

      for (const clip of nearby) {
        const asset = clip.mediaAssetId ? mediaById.get(clip.mediaAssetId) : undefined;
        if (!asset?.url) continue;

        if (clip.kind === "video" && !videoElsRef.current.has(clip.id)) {
          const el = document.createElement("video");
          el.src = asset.url;
          el.muted = true;
          el.playsInline = true;
          el.crossOrigin = "anonymous";
          videoElsRef.current.set(clip.id, el);
        }
        if (clip.kind === "image" && !imageElsRef.current.has(clip.id)) {
          const el = document.createElement("img");
          el.src = asset.url;
          el.crossOrigin = "anonymous";
          imageElsRef.current.set(clip.id, el);
        }
      }

      for (const [id, el] of [...videoElsRef.current]) {
        if (!nearbyIds.has(id)) {
          el.pause();
          el.removeAttribute("src");
          el.load();
          videoElsRef.current.delete(id);
        }
      }
      for (const id of [...imageElsRef.current.keys()]) {
        if (!nearbyIds.has(id)) imageElsRef.current.delete(id);
      }
    }
  }, [timeline, mediaById]);

  // Persistent render loop: always runs while mounted so edits made while
  // paused (properties panel changes, scrubbing) redraw immediately, not
  // just during playback.
  useEffect(() => {
    let lastStatsPush = 0;
    const tick = () => {
      const state = useProjectStore.getState();
      const compositor = compositorRef.current;
      const t = state.timeline;
      if (compositor && t) {
        for (const [clipId, el] of videoElsRef.current) {
          const clip = t.clips.find((c) => c.id === clipId);
          if (!clip) continue;

          // Once the playhead has moved past this clip's own end, freeze it
          // rather than continuing to seek/play it for the rest of the
          // "nearby" lookahead window (CanvasStage keeps the element alive
          // for 1s past endSec so the *next* clip's video has time to load —
          // this clip itself has nothing left to show). Left unclamped, the
          // raw `target` below keeps growing past the clip's own source
          // duration, and seeking a <video> element past its real duration
          // gets silently clamped by the browser to (or just past) its last
          // decodable frame — which for many encodes is a partial/blocky GOP
          // tail, i.e. exactly the "glitch at the end of the clip" symptom.
          const rawTarget = (clip.mediaInSec ?? 0) + (state.playheadSec - clip.startSec) * (clip.playbackRate ?? 1);
          const maxTarget = Number.isFinite(el.duration) ? Math.max(0, el.duration - 0.1) : rawTarget;
          const target = Math.min(rawTarget, maxTarget);
          const clipEnded = state.playheadSec >= clip.endSec;

          if (Math.abs(el.currentTime - target) > 0.15 && el.readyState >= 1) el.currentTime = target;
          if (state.isPlaying && !clipEnded && el.paused) void el.play().catch(() => {});
          if ((!state.isPlaying || clipEnded) && !el.paused) el.pause();
        }

        const sources: FrameSources = {
          get(clipId): FrameSourceEntry | undefined {
            const video = videoElsRef.current.get(clipId);
            if (video && video.readyState >= 2) return { source: video, timeSec: video.currentTime };
            const image = imageElsRef.current.get(clipId);
            if (image) return { source: image, timeSec: null };
            return undefined;
          },
        };

        const canvas = canvasRef.current;
        if (canvas) {
          const displayW = canvas.clientWidth || t.width;
          const displayH = canvas.clientHeight || t.height;
          const scale = Math.min(displayW / t.width, displayH / t.height) || 1;
          compositor.resizeCanvas(Math.round(t.width * scale), Math.round(t.height * scale));
        }
        compositor.renderFrame(t, state.playheadSec, sources);

        const now = performance.now();
        if (now - lastStatsPush > 250) {
          lastStatsPush = now;
          state.setPreviewStats(compositor.getStats());
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!timeline) return null;
  const aspect = timeline.width / timeline.height;

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#050505", minHeight: 0 }}>
      <canvas
        ref={canvasRef}
        style={{ height: "100%", maxHeight: "100%", aspectRatio: `${aspect}`, background: timeline.backgroundColor || "#000" }}
        onClick={() => selectClip(null)}
      />
    </div>
  );
}
