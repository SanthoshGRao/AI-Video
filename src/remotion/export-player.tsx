import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  OffthreadVideo,
  Sequence,
} from "remotion";
import type { RenderTrack, RenderTrackItem, RenderTransition } from "@/lib/editor/render-types";
import { clipLayerPriority } from "@/lib/editor-v2/layer-priority";
import type { ClipKind } from "@/lib/editor-v2/editor-data";
import { Compositor } from "@/lib/engine/compositor";
import { assetRegistry } from "@/lib/engine/asset-registry";
import { loadFonts } from "@/fonts/google-fonts";

/**
 * Compositing stack (back → front) — shares editor-v2's canonical layer
 * priorities (`CLIP_LAYER_PRIORITY`) so the export paints in the same order
 * the editor previews; otherwise a full-frame video drawn after the titles
 * track hides the titles.
 */
const RENDER_TYPE_TO_CLIP_KIND: Record<string, ClipKind> = {
  audio: "audio",
  video: "video",
  image: "image",
  shape: "overlay",
  text: "text",
  caption: "subtitle",
};

function itemLayerPriority(type: string): number {
  return clipLayerPriority(RENDER_TYPE_TO_CLIP_KIND[type] ?? "overlay");
}

function activeItemsAtTime(
  timeMs: number,
  durationMs: number,
  tracks: RenderTrack[],
  trackItemsMap: Record<string, RenderTrackItem>,
): RenderTrackItem[] {
  const out: { item: RenderTrackItem; order: number }[] = [];
  let order = 0;
  for (const track of tracks) {
    for (const id of track.items) {
      const item = trackItemsMap[id];
      if (!item || item.type === "audio") continue;
      const start = item.display?.from ?? 0;
      const end = item.display?.to ?? durationMs;
      if (timeMs >= start && timeMs <= end) out.push({ item, order: order++ });
    }
  }
  // Stable sort by layer priority (back → front); ties keep timeline order.
  out.sort((a, b) => {
    const pa = itemLayerPriority(a.item.type);
    const pb = itemLayerPriority(b.item.type);
    return pa !== pb ? pa - pb : a.order - b.order;
  });
  return out.map((entry) => entry.item);
}

function num(value: unknown, fallback = 0): number {
  const n = parseFloat(String(value ?? "").replace(/(px|deg)$/, ""));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * CSS overrides for a clip taking part in a transition. `p` is 0→1 across the
 * transition window; `role` is the outgoing or incoming side. Mirrors the
 * editor's transition-runtime so the export animates the same way.
 */
function transitionStyle(
  type: string | undefined,
  p: number,
  role: "out" | "in",
): { opacity: number; transform: string } {
  const t = Math.max(0, Math.min(1, p));
  switch (type) {
    case "slide":
    case "push":
      return role === "out"
        ? { opacity: 1, transform: `translateX(${-100 * t}%)` }
        : { opacity: 1, transform: `translateX(${100 * (1 - t)}%)` };
    case "zoom":
      return role === "out"
        ? { opacity: 1 - t, transform: `scale(${1 + 0.3 * t})` }
        : { opacity: t, transform: `scale(${0.7 + 0.3 * t})` };
    // fade / blur / dissolve / default → cross dissolve
    default:
      return role === "out"
        ? { opacity: 1 - t, transform: "" }
        : { opacity: t, transform: "" };
  }
}

/**
 * Remotion-only export renderer.
 *
 * Video is rendered with <OffthreadVideo> (ffmpeg extracts the EXACT frame per
 * timestamp) instead of seeking an HTMLVideoElement onto a canvas — the latter
 * is frame-inaccurate and produces the stutter/lag/duplicate-frame glitches.
 * The canvas sits on top (transparent) and draws only images, shapes, text and
 * captions, so overlays keep pixel-parity with the editor.
 */
export interface ExportPlayerProps {
  tracks: RenderTrack[];
  trackItemsMap: Record<string, RenderTrackItem>;
  transitionsMap: Record<string, RenderTransition>;
  duration: number;
  background: { type: "color" | "image"; value: string };
}

export default function ExportPlayer({
  tracks,
  trackItemsMap,
  transitionsMap,
  duration,
  background,
}: ExportPlayerProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const preloadHandleRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const backgroundColor =
    background?.type === "color" && background.value ? background.value : "#000000";

  // 1. Register global preloader delayRender handle on mount
  useEffect(() => {
    if (preloadHandleRef.current === null) {
      preloadHandleRef.current = delayRender("Preloading export assets");
    }
  }, []);

  // 2. Preload canvas assets (images) + fonts. Video is handled by
  //    <OffthreadVideo> and doesn't need the canvas asset pool.
  useEffect(() => {
    const items = Object.values(trackItemsMap);
    const loads = items.flatMap((item) => {
      const src = item.details?.src;
      if (!src) return [];
      if (item.type === "image") return [assetRegistry.loadImage(src)];
      return [];
    });

    const textItems = items.filter((item) => item.type === "text" || item.type === "caption");
    const fontFamilies = Array.from(new Set(textItems.map((item) => item.details?.fontFamily).filter(Boolean))) as string[];
    const fontPromise = fontFamilies.length > 0
      ? loadFonts({ families: fontFamilies }).catch((err: any) => {
          console.warn("[export-player] Font preload failed:", err);
        })
      : Promise.resolve();

    Promise.all([
      fontPromise,
      ...loads.map((p) => p.catch((err: any) => {
        console.warn("[export-player] Asset preload failed:", err);
        return undefined;
      }))
    ])
      // Wait until the browser reports every @font-face is actually ready for
      // the canvas — otherwise the first frames render in a fallback font.
      .then(async () => {
        if (typeof document !== "undefined" && document.fonts?.ready) {
          await document.fonts.ready.catch(() => undefined);
        }
      })
      .then(() => {
        setIsReady(true);
        if (preloadHandleRef.current !== null) {
          continueRender(preloadHandleRef.current);
          preloadHandleRef.current = null;
        }
      });
  }, [trackItemsMap]);

  // 3. Render the overlay canvas (everything except video) only when ready.
  useLayoutEffect(() => {
    if (!isReady) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = delayRender(`frame-${frame}`);
    let cancelled = false;

    const render = async () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (!cancelled) continueRender(handle);
        return;
      }

      if (!compositorRef.current) {
        compositorRef.current = new Compositor(ctx, width, height);
      } else {
        compositorRef.current.setDimensions(width, height);
      }

      const timeMs = (frame / fps) * 1000;
      // Video is drawn by <OffthreadVideo> beneath the canvas — exclude it here.
      const items = activeItemsAtTime(timeMs, duration, tracks, trackItemsMap).filter(
        (item) => item.type !== "video",
      );

      const missingLoads = items.flatMap((item) => {
        const src = item.details?.src;
        if (!src) return [];
        if (assetRegistry.get(src)) return [];
        if (item.type === "image") return [assetRegistry.loadImage(src)];
        return [];
      });

      const frameTextItems = items.filter((item) => item.type === "text" || item.type === "caption");
      const frameFontFamilies = Array.from(
        new Set(frameTextItems.map((item) => item.details?.fontFamily).filter(Boolean))
      ) as string[];
      const missingFonts = frameFontFamilies.filter((family) => {
        try {
          return !document.fonts.check(`16px "${family}"`);
        } catch {
          return true;
        }
      });

      if (missingLoads.length > 0 || missingFonts.length > 0) {
        try {
          await Promise.all([
            ...missingLoads,
            missingFonts.length > 0 ? loadFonts({ families: missingFonts }) : Promise.resolve(),
          ]);
        } catch (err) {
          console.warn("[export-player] Failed to load frame assets/fonts asynchronously", err);
        }
      }

      if (cancelled) {
        continueRender(handle);
        return;
      }

      try {
        // Transparent background so the OffthreadVideo layer shows through; the
        // project background colour is painted by the DOM layer below.
        await compositorRef.current.renderFrame(timeMs, items, { type: "none", value: "" });
      } catch (err) {
        console.warn("[export-player] frame render failed", frame, err);
      }

      if (!cancelled) continueRender(handle);
    };

    void render();

    return () => {
      cancelled = true;
      continueRender(handle);
    };
  }, [frame, fps, width, height, tracks, trackItemsMap, duration, isReady]);

  // Video items rendered as real Remotion video layers (frame-accurate).
  const videoItems: RenderTrackItem[] = [];
  const audioItems: RenderTrackItem[] = [];
  for (const track of tracks) {
    const isAudioTrack =
      (track.type as string) === "audio" || (track.type as string) === "voiceover";
    for (const id of track.items) {
      const item = trackItemsMap[id];
      if (!item) continue;
      if (item.type === "video") videoItems.push(item);
      else if (isAudioTrack || item.type === "audio") audioItems.push(item);
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Project background */}
      <div style={{ position: "absolute", inset: 0, background: backgroundColor, zIndex: 0 }} />

      {/* Video layers (bottom, frame-accurate via ffmpeg) */}
      {videoItems.map((item) => {
        const src = item.details?.src;
        if (!src) return null;

        const startMs = item.display?.from ?? 0;
        const endMs = item.display?.to ?? duration;
        const trimStartMs = item.trim?.from ?? 0;

        // Transitions: extend this clip's visible window into the neighbour and
        // ramp opacity/transform so two clips cross-dissolve. Content stays in
        // sync by pulling startFrom back by the same amount the window grows.
        const transitions = (Object.values(transitionsMap ?? {}) as RenderTransition[]).filter(
          (t) => t.fromId && t.toId && t.fromId !== t.toId,
        );
        const outT = transitions.find((t) => t.fromId === item.id);
        const inT = transitions.find((t) => t.toId === item.id);
        const outHalfMs = outT ? (outT.duration ?? 500) / 2 : 0;
        const inHalfMs = inT ? (inT.duration ?? 500) / 2 : 0;

        const winStartMs = startMs - inHalfMs;
        const winEndMs = endMs + outHalfMs;
        const startFrame = Math.round((winStartMs / 1000) * fps);
        const endFrame = Math.round((winEndMs / 1000) * fps);
        const durationInFrames = Math.max(1, endFrame - startFrame);
        // Keep frames aligned: window grew earlier by inHalf, so rewind source.
        const effectiveTrimMs = Math.max(0, trimStartMs - inHalfMs);

        const d = item.details ?? {};
        const left = num(d.left);
        const top = num(d.top);
        const w = num(d.width, width);
        const h = num(d.height, height);
        const rot = num(d.rotation ?? d.rotate, 0);
        const opacityRaw = typeof d.opacity === "number" ? d.opacity : num(d.opacity, 100);
        const baseOpacity = opacityRaw > 1 ? opacityRaw / 100 : opacityRaw;
        const objectFit = ((d as { objectFit?: string }).objectFit as "cover" | "contain") ?? "cover";
        const playbackRate = (item as any).playbackRate ?? 1;
        const isMuted = (d as { muted?: boolean }).muted === true;
        const volume = isMuted
          ? 0
          : Math.max(0, Math.min(1, num((d as { volume?: number }).volume, 100) / 100));

        // Per-frame transition style based on the GLOBAL time.
        const tGlobalMs = (frame / fps) * 1000;
        let transOpacity = 1;
        let transTransform = "";
        if (outT) {
          const b = endMs;
          const dur = outT.duration ?? 500;
          if (tGlobalMs >= b - dur / 2 && tGlobalMs <= b + dur / 2) {
            const s = transitionStyle(outT.type, (tGlobalMs - (b - dur / 2)) / dur, "out");
            transOpacity = s.opacity;
            transTransform = s.transform;
          }
        }
        if (inT) {
          const b = startMs;
          const dur = inT.duration ?? 500;
          if (tGlobalMs >= b - dur / 2 && tGlobalMs <= b + dur / 2) {
            const s = transitionStyle(inT.type, (tGlobalMs - (b - dur / 2)) / dur, "in");
            transOpacity = s.opacity;
            transTransform = s.transform;
          }
        }

        const transform = [rot ? `rotate(${rot}deg)` : "", transTransform]
          .filter(Boolean)
          .join(" ");

        return (
          <Sequence
            key={item.id}
            from={startFrame}
            durationInFrames={durationInFrames}
            layout="none"
          >
            <div
              style={{
                position: "absolute",
                left,
                top,
                width: w,
                height: h,
                transform: transform || undefined,
                opacity: baseOpacity * transOpacity,
                overflow: "hidden",
                zIndex: 1,
              }}
            >
              <OffthreadVideo
                src={src}
                startFrom={Math.round((effectiveTrimMs / 1000) * fps)}
                playbackRate={playbackRate}
                muted={isMuted}
                volume={volume}
                style={{ width: "100%", height: "100%", objectFit }}
              />
            </div>
          </Sequence>
        );
      })}

      {/* Overlay canvas (images, shapes, text, captions) — transparent, on top */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          background: "transparent",
          zIndex: 2,
        }}
      />

      {audioItems.map((item) => {
        const src = item.details?.src;
        if (!src) return null;

        const startFrame = Math.round(((item.display?.from ?? 0) / 1000) * fps);
        const endFrame = Math.round(((item.display?.to ?? duration) / 1000) * fps);
        const durationInFrames = Math.max(1, endFrame - startFrame);

        const trimStartMs = item.trim?.from ?? 0;
        const volume = typeof item.details?.volume === "number"
          ? item.details.volume / 100
          : typeof item.details?.volume === "string"
            ? parseFloat(item.details.volume) / 100
            : 1;
        const playbackRate = (item as any).playbackRate ?? 1;

        return (
          <Sequence
            key={item.id}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            <Audio
              src={src}
              startFrom={Math.round((trimStartMs / 1000) * fps)}
              volume={volume}
              playbackRate={playbackRate}
            />
          </Sequence>
        );
      })}
    </div>
  );
}
