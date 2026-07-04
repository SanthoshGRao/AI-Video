/**
 * Preview Canvas — react-konva.
 *
 * Renders the visible clips at `currentTime` in correct z-order:
 *   image / video (background)
 *   text overlays
 *   fact overlays
 *   subtitles (always on top)
 *
 * Video/image elements are HTML <video>/<img> piped into Konva.Image;
 * audio playback is handled by the AudioPlayer component (see Preview.tsx).
 * The playback clock is the single source of time for everything visual.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import { useEditorStore } from "../store";
import type { Clip, FactClip, MediaClip, SubtitleClip, TextClip } from "../schema";
import { clipPropertyAt } from "../keyframes";

export function PreviewCanvas() {
  const timeline = useEditorStore((s) => s.timeline);
  const bundle = useEditorStore((s) => s.bundle);
  const currentTime = useEditorStore((s) => s.currentTime);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projW = timeline?.width ?? 1920;
  const projH = timeline?.height ?? 1080;
  const fit = useMemo(() => {
    if (!size.w || !size.h) return { scale: 1, x: 0, y: 0, w: projW, h: projH };
    const scale = Math.min(size.w / projW, size.h / projH) * 0.92;
    const w = projW * scale;
    const h = projH * scale;
    return { scale, x: (size.w - w) / 2, y: (size.h - h) / 2, w, h };
  }, [size, projW, projH]);

  const visibleClips = useMemo(() => {
    if (!timeline) return [] as Clip[];
    return timeline.clips
      .filter((c) => !c.hidden)
      .filter((c) => currentTime >= c.start && currentTime < c.start + c.duration)
      .filter((c) => {
        const t = timeline.tracks.find((tr) => tr.id === c.trackId);
        return !t?.hidden;
      });
  }, [timeline, currentTime]);

  const ordered = useMemo(() => {
    const order: Record<Clip["kind"], number> = {
      media: 0,
      text: 1,
      fact: 2,
      subtitle: 3,
      audio: -1,
    };
    return [...visibleClips].sort((a, b) => order[a.kind] - order[b.kind]);
  }, [visibleClips]);

  return (
    <div
      ref={wrapRef}
      className="relative flex flex-1 items-center justify-center overflow-hidden bg-slate-100"
    >
      <Stage width={size.w} height={size.h}>
        <Layer>
          <Rect x={fit.x} y={fit.y} width={fit.w} height={fit.h} fill="#000" cornerRadius={4} />
          {ordered.map((c) => {
            if (c.kind === "media") {
              const mc = c as MediaClip;
              const asset = bundle?.mediaAssets.find((a) => a.id === mc.assetId);
              if (!asset) return null;
              if (asset.kind === "image") {
                return <ImageClipNode key={c.id} clip={mc} url={asset.url} fit={fit} time={currentTime} />;
              }
              return <VideoClipNode key={c.id} clip={mc} url={asset.url} fit={fit} time={currentTime} />;
            }
            if (c.kind === "text") return <TextClipNode key={c.id} clip={c as TextClip} fit={fit} time={currentTime} />;
            if (c.kind === "fact") return <FactClipNode key={c.id} clip={c as FactClip} fit={fit} time={currentTime} />;
            if (c.kind === "subtitle") return <SubtitleClipNode key={c.id} clip={c as SubtitleClip} fit={fit} />;
            return null;
          })}
        </Layer>
      </Stage>
    </div>
  );
}

type Fit = { scale: number; x: number; y: number; w: number; h: number };

function opacityAt(clip: Clip, time: number, fallback = 1) {
  const v = clipPropertyAt(clip, "opacity", time, fallback);
  return Math.max(0, Math.min(1, v));
}

function ImageClipNode({ clip, url, fit, time }: { clip: MediaClip; url: string; fit: Fit; time: number }) {
  const [img] = useImage(url, "anonymous");
  if (!img) return null;
  const op = opacityAt(clip, time, clip.opacity);
  return (
    <KonvaImage image={img} x={fit.x} y={fit.y} width={fit.w} height={fit.h} opacity={op} listening={false} />
  );
}

function VideoClipNode({ clip, url, fit, time }: { clip: MediaClip; url: string; fit: Fit; time: number }) {
  const playing = useEditorStore((s) => s.playing);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [, force] = useState(0);
  const imgRef = useRef<Konva.Image | null>(null);

  // Create video element once
  useEffect(() => {
    if (!url) return;
    const v = document.createElement("video");
    v.src = url;
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    videoRef.current = v;
    v.addEventListener("loadeddata", () => force((n) => n + 1));
    return () => {
      v.pause();
      videoRef.current = null;
    };
  }, [url]);

  // Sync time
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const localTime = (time - clip.start) + (clip.inPoint ?? 0);
    if (Math.abs(v.currentTime - localTime) > 0.15) v.currentTime = localTime;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, time, clip.start, clip.inPoint]);

  // Animation frame to redraw
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      imgRef.current?.getLayer()?.batchDraw();
      raf = requestAnimationFrame(tick);
    };
    if (playing) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const v = videoRef.current;
  if (!v) return null;
  const op = opacityAt(clip, time, clip.opacity);
  return (
    <KonvaImage
      ref={imgRef as never}
      image={v as unknown as HTMLImageElement}
      x={fit.x}
      y={fit.y}
      width={fit.w}
      height={fit.h}
      opacity={op}
      listening={false}
    />
  );
}

function TextClipNode({ clip, fit, time }: { clip: TextClip; fit: Fit; time: number }) {
  const textContent = typeof clip.text === "string" ? clip.text : String(clip.text ?? "");
  const style = clip.style ?? {};
  const fontFamily = style.fontFamily ?? "Inter";
  const fontSize = (style.fontSize ?? 48) * fit.scale;
  const fontWeight = style.fontWeight ?? 700;
  const color = style.color ?? "#ffffff";
  const align = style.align ?? "center";
  const posX = style.x ?? 0.5;
  const posY = style.y ?? 0.5;

  const x = fit.x + posX * fit.w;
  const y = fit.y + posY * fit.h;
  const op = opacityAt(clip, time, 1);

  return (
    <Text
      text={textContent}
      x={x - 400 * fit.scale}
      y={y - fontSize / 2}
      width={800 * fit.scale}
      align={align}
      fontFamily={fontFamily}
      fontSize={fontSize}
      fontStyle={`${fontWeight >= 700 ? "bold" : "normal"}`}
      fill={color}
      shadowColor={style.shadow ? "rgba(0,0,0,0.5)" : undefined}
      shadowBlur={style.shadow ? 8 : 0}
      stroke={style.strokeColor}
      strokeWidth={(style.strokeWidth ?? 0) * fit.scale}
      opacity={op}
      listening={false}
    />
  );
}

function FactClipNode({ clip, fit, time }: { clip: FactClip; fit: Fit; time: number }) {
  const textContent = typeof clip.text === "string" ? clip.text : String(clip.text ?? "");
  const style = clip.style ?? {};
  const fontSize = (style.fontSize ?? 56) * fit.scale;
  const fontFamily = style.fontFamily ?? "Inter";
  const color = style.color ?? "#ffffff";
  const align = style.align ?? "center";
  const posX = style.x ?? 0.5;
  const posY = style.y ?? 0.22;

  const w = 1000 * fit.scale;
  const padX = 32 * fit.scale;
  const padY = 16 * fit.scale;
  const x = fit.x + posX * fit.w - w / 2;
  const y = fit.y + posY * fit.h - fontSize / 2 - padY;
  const local = time - clip.start;
  const enter = Math.min(1, local / 0.3);
  const op = opacityAt(clip, time, enter);
  const slide = (1 - enter) * 20 * fit.scale;

  return (
    <Group x={x} y={y + slide} opacity={op} listening={false}>
      {style.background && (
        <Rect width={w} height={fontSize + padY * 2} fill={style.background} cornerRadius={12 * fit.scale} />
      )}
      <Text
        text={textContent}
        width={w}
        align={align}
        fontFamily={fontFamily}
        fontSize={fontSize}
        fontStyle="bold"
        fill={color}
        x={0}
        y={padY}
      />
    </Group>
  );
}

function SubtitleClipNode({ clip, fit }: { clip: SubtitleClip; fit: Fit }) {
  const textContent = typeof clip.text === "string" ? clip.text : String(clip.text ?? "");
  const fs = 36 * fit.scale;
  const w = fit.w * 0.86;
  const x = fit.x + (fit.w - w) / 2;
  const y = fit.y + fit.h - fs * 2.4;

  return (
    <Group listening={false}>
      <Rect x={x} y={y} width={w} height={fs * 1.6} fill="rgba(0,0,0,0.55)" cornerRadius={8 * fit.scale} />
      <Text
        text={textContent}
        x={x}
        y={y + fs * 0.3}
        width={w}
        align="center"
        fontFamily="Inter"
        fontSize={fs}
        fontStyle="bold"
        fill="#ffffff"
      />
    </Group>
  );
}
