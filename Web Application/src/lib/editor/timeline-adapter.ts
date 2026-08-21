import { createEmptyTimeline } from "@/lib/timeline/defaults";
import { syncTrackClipIds } from "@/lib/timeline/parse";
import type { TimelineClip, TimelineDocument } from "@/lib/timeline/types";
import type { EditorElement, EditorTrack } from "@/lib/editor/types";
import type { SubtitleCue, SubtitleStyle } from "@/lib/subtitles/types";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_EDITOR_TRACKS: EditorTrack[] = [
  { id: "track-video", type: "video", name: "Video", locked: false, visible: true },
  { id: "track-image", type: "overlay", name: "Image", locked: false, visible: true },
  { id: "track-text", type: "text", name: "Text", locked: false, visible: true },
  { id: "track-subtitle", type: "subtitle", name: "Subtitles", locked: false, visible: true },
  { id: "track-voiceover", type: "audio", name: "Voiceover", locked: false, visible: true },
  { id: "track-music", type: "audio", name: "Music", locked: false, visible: true },
];

export function elementsToTimelineDocument(
  elements: EditorElement[],
  durationMs: number,
  aspect: { width: number; height: number; label: string }
): TimelineDocument {
  const doc = createEmptyTimeline(durationMs);
  doc.settings.width = aspect.width;
  doc.settings.height = aspect.height;
  doc.settings.aspectRatio = aspect.label as "9:16" | "16:9" | "1:1";

  const clips: Record<string, TimelineClip> = {};
  for (const el of elements) {
    const trackId =
      el.trackIndex === 0 ? "track-video"
      : el.trackIndex === 1 ? "track-image"
      : el.trackIndex === 2 ? "track-text"
      : el.trackIndex === 3 ? "track-subtitle"
      : el.trackIndex === 4 ? "track-voiceover"
      : "track-music";

    const id = el.id || uid("clip");
    clips[id] = {
      id,
      trackId,
      mediaAssetId: el.mediaAssetId,
      audioAssetId: el.audioAssetId,
      type:
        el.type === "video"
          ? "video"
          : el.type === "image"
            ? "image"
            : el.type === "audio"
              ? "audio"
              : "text",
      startTime: el.startMs,
      endTime: el.endMs,
      trimStart: 0,
      trimEnd: el.endMs - el.startMs,
      properties: {
        position: el.position,
        size: el.size,
        rotation: el.rotation,
        opacity: el.opacity,
        fit: el.fit,
        text: el.text,
        style: el.style,
        cueId: el.cueId,
        animation: el.animation,
        textOverlayMeta: el.textOverlayMeta,
      },
    };
  }

  doc.clips = clips;
  return syncTrackClipIds(doc);
}

export function timelineDocumentToElements(
  doc: TimelineDocument,
  ctx: {
    mediaById: Map<string, { r2Url: string; originalName: string; type: string; localPath?: string | null }>;
    audio?: { id: string; r2Url: string; durationMs?: number; localPath?: string | null } | null;
    subtitleCues: Array<{ id: string; startMs: number; endMs: number; text: string; words?: Array<{ word: string; startMs: number; endMs: number }> }>;
  }
): EditorElement[] {
  const elements: EditorElement[] = [];
  const trackIndex = (trackId: string) => {
    if (trackId.includes("video") || trackId.endsWith("-1") || trackId.endsWith("-video")) return 0;
    if (trackId.includes("image") || trackId.endsWith("-2") || trackId.endsWith("-image")) return 1;
    if ((trackId.includes("text") && !trackId.includes("sub")) || trackId.includes("facts") || trackId.endsWith("-3") || trackId.endsWith("-text")) return 2;
    if (trackId.includes("sub") || trackId.endsWith("-5") || trackId.endsWith("-subtitle")) return 3;
    if (trackId.includes("voice") || trackId.endsWith("-4") || trackId.endsWith("-voiceover")) return 4;
    if (trackId.includes("music") || trackId.endsWith("-6") || trackId.endsWith("-music")) return 5;
    if (trackId.includes("audio")) return 4;
    return 0;
  };

  for (const clip of Object.values(doc.clips)) {
    const ti = trackIndex(clip.trackId);
    if (clip.audioAssetId && ctx?.audio && clip.audioAssetId === ctx.audio.id) {
      elements.push({
        id: clip.id,
        type: "audio",
        trackIndex: 4,
        startMs: clip.startTime,
        endMs: clip.endTime,
        audioAssetId: clip.audioAssetId,
        mediaUrl: ctx?.audio?.r2Url || "",
        localPath: ctx?.audio?.localPath ?? null,
        mediaName: "Voiceover",
        style: (clip.properties?.style as Record<string, unknown>) ?? {},
        animation: clip.properties?.animation as EditorElement["animation"],
        textOverlayMeta: clip.properties?.textOverlayMeta as EditorElement["textOverlayMeta"],
        visible: true,
        locked: false,
      });
      continue;
    }
    if (clip.mediaAssetId || clip.type === "image" || clip.type === "shape" as any || clip.type === "video" || clip.type === "audio") {
      let mediaIdToLookup = clip.mediaAssetId;
      if (!mediaIdToLookup && clip.type === "audio" && clip.audioAssetId && (!ctx?.audio || clip.audioAssetId !== ctx.audio.id)) {
        mediaIdToLookup = clip.audioAssetId;
      }
      
      const m = mediaIdToLookup && ctx?.mediaById ? ctx.mediaById.get(mediaIdToLookup) : undefined;
      const isVideo = m?.type === "VIDEO" || clip.type === "video";
      const isAudio = m?.type === "AUDIO" || clip.type === "audio";
      const src =
        m?.r2Url ||
        (clip.properties as { src?: string } | undefined)?.src ||
        (clip.properties?.style as { src?: string } | undefined)?.src;
      
      const emoji = clip.properties?.emoji as string | undefined;
      const shapeType = clip.properties?.shapeType as string | undefined;
      const elKind = clip.properties?.kind as string | undefined;

      if (src || emoji || shapeType || elKind === "shape" || elKind === "sticker") {
        elements.push({
          id: clip.id,
          type: (elKind === "shape" || shapeType) ? "shape" : isAudio ? "audio" : isVideo ? "video" : "image",
          trackIndex: ti,
          startMs: clip.startTime,
          endMs: clip.endTime,
          mediaAssetId: mediaIdToLookup,
          mediaUrl: src,
          mediaName: m?.originalName || (isAudio ? "Audio" : emoji ? `Sticker ${emoji}` : shapeType ? `Shape ${shapeType}` : "Media"),
          localPath: m?.localPath,
          position: (clip.properties?.position as { x: number; y: number }) ?? {
            x: 0,
            y: 0,
          },
          size: (clip.properties?.size as { width: number; height: number }) ?? {
            width: doc.settings.width,
            height: doc.settings.height,
          },
          opacity: (clip.properties?.opacity as number) ?? 1,
          rotation: (clip.properties?.rotation as number) ?? 0,
          fit: (clip.properties?.fit as "cover" | "contain" | "fill") ?? "cover",
          trimStartMs: clip.trimStart ?? 0,
          muted: (clip.properties?.muted as boolean) ?? false,
          volume: (clip.properties?.volume as number) ?? 1,
          playbackRate: ((clip as { playbackRate?: number }).playbackRate) ?? 1,
          style: {
            ...((clip.properties?.style as Record<string, unknown>) ?? {}),
            emoji,
            shapeType,
            kind: elKind,
            color: clip.properties?.color,
          },
          visible: true,
          locked: false,
        });
        continue;
      }
    }
    const track = doc.tracks.find((t) => t.id === clip.trackId);
    if (clip.subtitleTrackId || clip.trackId.includes("subtitle") || track?.type === "subtitle") {
      continue;
    }
    if (clip.type === "text") {
      elements.push({
        id: clip.id,
        type: "text",
        trackIndex: 2,
        startMs: clip.startTime,
        endMs: clip.endTime,
        text: String(clip.properties?.text ?? ""),
        style: (clip.properties?.style as Record<string, unknown>) ?? {},
        animation: clip.properties?.animation as EditorElement["animation"],
        textOverlayMeta: clip.properties?.textOverlayMeta as EditorElement["textOverlayMeta"],
        position: (clip.properties?.position as { x: number; y: number }) ?? {
          x: 100,
          y: 100,
        },
        size: (clip.properties?.size as { width: number; height: number }) ?? {
          width: 400,
          height: 80,
        },
        visible: true,
        locked: false,
      });
    }
  }

  if (ctx.subtitleCues.length > 0) {
    elements.push({
      id: "sub-master",
      type: "subtitle",
      trackIndex: 3,
      startMs: ctx.subtitleCues[0].startMs,
      endMs: ctx.subtitleCues[ctx.subtitleCues.length - 1].endMs,
      text: ctx.subtitleCues.map((cue) => cue.text).join(" "),
      cueId: "master",
      visible: true,
      locked: false,
    });
  }

  if (ctx.audio && !elements.some((e) => e.type === "audio")) {
    elements.push({
      id: "audio-voiceover",
      type: "audio",
      trackIndex: 4,
      startMs: 0,
      endMs: ctx.audio.durationMs ?? Math.max(...elements.map((e) => e.endMs), doc.settings.durationMs),
      audioAssetId: ctx.audio.id,
      mediaUrl: ctx.audio.r2Url,
      localPath: ctx.audio.localPath,
      mediaName: "Voiceover",
      style: {},
      visible: true,
      locked: false,
    });
  }

  return elements;
}

export function getSubtitlesFromTimeline(
  doc: TimelineDocument,
  originalCues: SubtitleCue[] = []
): { cues: SubtitleCue[]; style: SubtitleStyle | null } {
  const subtitleClips = Object.values(doc.clips || {})
    .filter((clip) => clip.trackId === "track-subtitle" || (clip.properties as any)?.textOverlayMeta?.category === "subtitle")
    .sort((a, b) => a.startTime - b.startTime);

  if (subtitleClips.length === 0) {
    return { cues: originalCues, style: null };
  }

  // Scale factor: canvasHeight / 90.
  const canvasHeight = doc.settings?.height || 1920;
  const scaleFactor = canvasHeight / 90;

  // Find a clip that has a style preset/custom style
  const styledClip = subtitleClips.find((c) => (c.properties as any)?.style);
  const clipStyle = (styledClip?.properties as any)?.style as Record<string, unknown> | undefined;

  let style: SubtitleStyle | null = null;
  if (clipStyle) {
    const posY = clipStyle["transform.positionY"] !== undefined ? Number(clipStyle["transform.positionY"]) : 600;
    
    style = {
      fontFamily: (clipStyle.fontFamily as string) ?? "Arial",
      fontSize: Number(clipStyle.fontSize ?? (15 * scaleFactor)),
      fontWeight: Number(clipStyle.fontWeight ?? 400),
      color: (clipStyle.color as string) ?? "#ffffff",
      backgroundColor: (clipStyle["background.color"] as string) ?? (clipStyle.backgroundColor as string) ?? "transparent",
      position: "bottom",
      animation: (clipStyle.animation as any) ?? "none",
      highlightColor: (clipStyle.highlightColor as string) ?? "#ff0000",
      stroke: clipStyle["stroke.enabled"] === true || clipStyle.stroke === true,
      strokeColor: (clipStyle["stroke.color"] as string) ?? (clipStyle.strokeColor as string) ?? "#000000",
      strokeWidth: Number(clipStyle["stroke.width"] ?? clipStyle.strokeWidth ?? 0),
      shadow: clipStyle.shadow === true,
    };
  }

  const normalizeText = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  const cues: SubtitleCue[] = subtitleClips.map((clip) => {
    // Reconstruct cue id
    const cueId = ((clip.properties as any)?.cueId as string) || clip.id.replace("subtitle-", "");
    const clipText = ((clip.properties as any)?.text as string) || "";

    // The subtitle clips carry the current (possibly edited) text/timing, while
    // originalCues carry the per-word timing. The cueId frequently doesn't match
    // (clips get fresh ids), so fall back to matching by text, then by time
    // overlap — otherwise the words are silently dropped and the caption
    // renderer dumps the entire script on screen at once.
    let originalCue = originalCues.find((c) => c.id === cueId);
    if (!originalCue && clipText) {
      const target = normalizeText(clipText);
      originalCue = originalCues.find((c) => normalizeText(c.text) === target);
    }
    if (!originalCue) {
      originalCue = originalCues.find(
        (c) => clip.startTime < c.endMs && clip.endTime > c.startMs,
      );
    }

    const startMs = clip.startTime;
    const endMs = clip.endTime;

    // Shift/scale words timing if present
    const words = originalCue?.words ? originalCue.words.map((w) => {
      const origDuration = originalCue.endMs - originalCue.startMs;
      const newDuration = endMs - startMs;
      if (Math.abs(origDuration - newDuration) < 10) {
        const shift = startMs - originalCue.startMs;
        return {
          word: w.word,
          startMs: Math.max(startMs, w.startMs + shift),
          endMs: Math.min(endMs, w.endMs + shift),
        };
      } else {
        const ratio = origDuration > 0 ? newDuration / origDuration : 1;
        const relativeStart = w.startMs - originalCue.startMs;
        const relativeEnd = w.endMs - originalCue.startMs;
        return {
          word: w.word,
          startMs: Math.round(startMs + relativeStart * ratio),
          endMs: Math.round(startMs + relativeEnd * ratio),
        };
      }
    }) : [];

    return {
      id: cueId,
      startMs,
      endMs,
      text: ((clip.properties as any)?.text as string) || "",
      words,
    };
  });

  return { cues, style };
}
