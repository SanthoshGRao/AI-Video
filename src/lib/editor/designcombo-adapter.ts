import { generateId } from "@designcombo/timeline";
import type {
  ICaption,
  IDesign,
  IImage,
  ITrack,
  ITrackItem,
  IVideo,
} from "@designcombo/types";
import type { EditorElement } from "@/lib/editor/types";
import type { LoadedProjectAssets } from "@/lib/editor/types";
import type { SubtitleCue, SubtitleStyle } from "@/lib/subtitles/types";
import {
  SECONDARY_FONT,
  SECONDARY_FONT_URL,
} from "@/_designcombo/editor/constants/constants";
import { FONTS } from "@/_designcombo/editor/data/fonts";

const FPS = 30;

function px(n: number): string {
  return `${Math.round(n)}px`;
}

function opacityPercent(opacity?: number): number {
  if (opacity == null) return 100;
  return opacity <= 1 ? Math.round(opacity * 100) : Math.round(opacity);
}

function defaultBoxShadow() {
  return { color: "#000000", x: 0, y: 0, blur: 0 };
}

function baseVisualDetails(
  canvasW: number,
  canvasH: number,
  el: EditorElement
) {
  const w = el.size?.width ?? canvasW;
  const h = el.size?.height ?? canvasH;
  const x = el.position?.x ?? 0;
  const y = el.position?.y ?? 0;
  const rot = el.rotation ?? 0;
  return {
    width: w,
    height: h,
    opacity: opacityPercent(el.opacity),
    top: px(y),
    left: px(x),
    transform: rot ? `rotate(${rot}deg)` : "none",
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "#000000",
    boxShadow: defaultBoxShadow(),
    blur: 0,
    brightness: 100,
    flipX: false,
    flipY: false,
    rotate: `${rot}deg`,
    visibility: (el.visible === false ? "hidden" : "visible") as
      | "visible"
      | "hidden",
  };
}

function resolveSrc(el: EditorElement): string | null {
  const url = el.mediaUrl?.trim();
  if (!url) return null;
  return url;
}

function sanitizeStyle(style?: Record<string, unknown>) {
  if (!style) return {};
  const { src: _src, previewUrl: _previewUrl, ...rest } = style as Record<string, unknown>;
  return rest;
}

function buildVideoItem(
  el: EditorElement,
  canvasW: number,
  canvasH: number,
  isMain: boolean
): IVideo | null {
  const src = resolveSrc(el);
  if (!src) return null;
  const from = el.startMs;
  const to = el.endMs;
  const duration = Math.max(to - from, 100);
  const trimFrom = el.trimStartMs ?? 0;
  const style = sanitizeStyle(el.style);
  // Honour the per-clip mixer set in the editor: muted stays muted, otherwise
  // the video's own audio plays at its volume (0..1 → 0..100).
  const muted = el.muted ?? (typeof style.muted === "boolean" ? style.muted : false);
  const volume01 = el.volume ?? (typeof style.volume === "number" ? style.volume : 1);
  const details = {
    ...baseVisualDetails(canvasW, canvasH, el),
    ...style,
    src,
    volume: muted ? 0 : Math.round(Math.max(0, Math.min(1, volume01)) * 100),
    muted,
    objectFit: el.fit === "contain" ? "contain" : "cover",
  };
  return {
    id: el.id,
    name: el.mediaName ?? "Video",
    type: "video",
    display: { from, to },
    trim: { from: trimFrom, to: trimFrom + duration },
    duration,
    playbackRate: 1,
    isMain,
    details,
    metadata: {
      previewUrl: src,
      mediaAssetId: el.mediaAssetId,
    },
  } as IVideo;
}

function buildImageItem(
  el: EditorElement,
  canvasW: number,
  canvasH: number
): IImage | null {
  const src = resolveSrc(el);
  const emoji = el.style?.emoji;
  const isSticker = el.style?.kind === "sticker";
  if (!src && !emoji && !isSticker) return null;
  const from = el.startMs;
  const to = el.endMs;
  const duration = Math.max(to - from, 100);
  const base = baseVisualDetails(canvasW, canvasH, el);
  const style = sanitizeStyle(el.style);
  return {
    id: el.id,
    name: el.mediaName ?? (emoji ? "Sticker" : "Image"),
    type: "image",
    display: { from, to },
    trim: { from: 0, to: duration },
    duration,
    details: {
      ...base,
      ...style,
      src: src || "",
      emoji: emoji || "",
      background: "transparent",
      transformOrigin: "center center",
      crop: { x: 0, y: 0, width: base.width, height: base.height },
      border: "none",
    },
    metadata: { previewUrl: src, mediaAssetId: el.mediaAssetId },
  } as IImage;
}

function buildAudioItem(el: EditorElement): ITrackItem | null {
  const src = resolveSrc(el);
  if (!src) return null;
  const from = el.startMs;
  const to = el.endMs;
  const duration = Math.max(to - from, 100);
  const style = sanitizeStyle(el.style);
  return {
    id: el.id,
    name: el.mediaName ?? "Audio",
    type: "audio",
    display: { from, to },
    trim: { from: 0, to: duration },
    duration,
    playbackRate: 1,
    details: {
      ...style,
      src,
      volume: typeof style.volume === "number" ? style.volume : 100,
    },
    metadata: { audioAssetId: el.audioAssetId },
  };
}

function captionTop(canvasH: number, position: SubtitleStyle["position"]) {
  if (position === "top") return px(canvasH * 0.1);
  if (position === "center") return px(canvasH * 0.43);
  return px(canvasH * 0.72);
}

function captionFontSize(styleSize: number, canvasW: number) {
  const scaled = styleSize * (canvasW / 390);
  return Math.round(Math.max(42, Math.min(scaled, 82)));
}

function cueWords(cue: SubtitleCue) {
  if (cue.words?.length) {
    const relStart = cue.startMs;
    return cue.words.map((w) => ({
      word: w.word,
      start: Math.max(0, w.startMs - relStart),
      end: Math.max(0, w.endMs - relStart),
      confidence: 1,
      is_keyword: false,
    }));
  }
  return [];
}

export function buildCaptionItem(
  cue: SubtitleCue,
  style: SubtitleStyle,
  canvasW: number,
  canvasH: number,
  id: string
): ICaption {
  const from = cue.startMs;
  const to = cue.endMs;
  const words = cueWords(cue);
  const strokeW = style.stroke ? style.strokeWidth : 0;
  const fontSize = captionFontSize(style.fontSize, canvasW);
  const horizontalPadding = Math.max(48, Math.round(canvasW * 0.07));
  const fontFam = style.fontFamily.split(",")[0]?.trim() ?? SECONDARY_FONT;
  const familyFonts = FONTS.filter((f) => f.family === fontFam);

  let bestFont = familyFonts[0];
  if (familyFonts.length > 0) {
    const isItalic = style.fontStyle === "italic";
    const targetWeightStr =
      style.fontWeight >= 900
        ? "Black"
        : style.fontWeight >= 800
        ? "ExtraBold"
        : style.fontWeight >= 700
        ? "Bold"
        : style.fontWeight >= 600
        ? "SemiBold"
        : style.fontWeight >= 500
        ? "Medium"
        : "Regular";

    let match = familyFonts.find(
      (f) =>
        f.postScriptName.includes(targetWeightStr) &&
        (isItalic
          ? f.postScriptName.includes("Italic")
          : !f.postScriptName.includes("Italic"))
    );
    if (!match) match = familyFonts.find((f) => f.postScriptName.includes(targetWeightStr));
    if (!match) match = familyFonts.find((f) => f.postScriptName.includes("Regular"));
    if (match) bestFont = match;
  }

  const postScriptName = bestFont?.postScriptName ?? fontFam;
  const resolvedFontUrl = bestFont?.url ?? SECONDARY_FONT_URL;

  return {
    id,
    name: "caption",
    type: "caption",
    display: { from, to },
    details: {
      text: cue.text,
      fontSize,
      // Use the human font FAMILY (e.g. "Bebas Neue") for canvas rendering and
      // Google-Fonts loading — the postScriptName ("BebasNeue-Regular") is not a
      // valid Google Fonts family and 400s on load, dropping the font entirely.
      fontFamily: fontFam,
      fontUrl: resolvedFontUrl,
      color: style.color,
      backgroundColor: style.backgroundColor,
      appearedColor: style.color,
      activeColor: style.highlightColor,
      activeFillColor: style.highlightColor,
      animation: style.animation,
      textAlign: "center" as const,
      width: canvasW - horizontalPadding * 2,
      height: fontSize * 2.2,
      top: captionTop(canvasH, style.position),
      left: px(horizontalPadding),
      opacity: 100,
      fontWeight: style.fontWeight,
      fontStyle: "normal",
      textDecoration: "none",
      lineHeight: "normal",
      letterSpacing: "normal",
      wordSpacing: "normal",
      border: "none",
      textShadow: style.shadow ? "2px 2px 4px rgba(0,0,0,0.8)" : "none",
      wordWrap: "normal",
      wordBreak: "normal",
      WebkitTextStrokeColor: style.strokeColor,
      WebkitTextStrokeWidth: `${strokeW}px`,
      borderWidth: strokeW,
      borderColor: style.strokeColor,
      boxShadow: defaultBoxShadow(),
      textTransform: "none" as "capitalize",
      transform: "none",
      skewX: 0,
      skewY: 0,
      words,
      linesPerCaption: 1,
      wordsPerLine: "punctuationOrPause",
      isKeywordColor: "transparent",
      preservedColorKeyWord: false,
    },
    metadata: { cueId: cue.id },
    isMain: false,
  };
}

export function buildMasterCaptionItem(
  cues: SubtitleCue[],
  style: SubtitleStyle,
  canvasW: number,
  canvasH: number,
  id = "sub-master"
): ICaption | null {
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
  const firstCue = sorted[0];
  if (!firstCue) return null;

  const from = firstCue.startMs;
  const words = sorted.flatMap((cue) =>
    cueWords(cue).map((word) => ({
      word: word.word,
      startMs: Math.round(from + (cue.startMs - from) + word.start),
      endMs: Math.round(from + (cue.startMs - from) + word.end),
    }))
  );

  const masterCue: SubtitleCue = {
    id: "master",
    startMs: from,
    endMs: Math.max(...sorted.map((cue) => cue.endMs)),
    text: sorted.map((cue) => cue.text).join(" "),
    words,
  };

  return buildCaptionItem(masterCue, style, canvasW, canvasH, id);
}

function makeTrack(
  type: ITrack["type"],
  itemIds: string[]
): ITrack {
  return {
    id: generateId(),
    type,
    items: itemIds,
    muted: false,
    accepts: [
      "text",
      "image",
      "video",
      "audio",
      "caption",
      "template",
    ],
    magnetic: false,
    static: false,
  };
}

export type ProjectDesignInput = {
  projectId: string;
  loaded: LoadedProjectAssets;
  aspect?: { width: number; height: number };
};

/**
 * Converts project timeline + media + subtitles into DesignCombo IDesign for Remotion preview.
 */
export function projectAssetsToDesign(input: ProjectDesignInput): IDesign {
  const { projectId, loaded } = input;
  const canvasW =
    input.aspect?.width ??
    loaded.timeline?.settings?.width ??
    1080;
  const canvasH =
    input.aspect?.height ??
    loaded.timeline?.settings?.height ??
    1920;

  // Element position/size are authored in the timeline's canvas space
  // (e.g. 1080×1920). When exporting at a different resolution (e.g. 720×1280)
  // every coordinate must be scaled or overlays land off-frame. Font size is
  // NOT scaled here — the Compositor scales it by the export height.
  const authoredW = loaded.timeline?.settings?.width ?? canvasW;
  const authoredH = loaded.timeline?.settings?.height ?? canvasH;
  const scaleX = authoredW > 0 ? canvasW / authoredW : 1;
  const scaleY = authoredH > 0 ? canvasH / authoredH : 1;
  const scaleElement = (el: EditorElement): EditorElement => {
    if (scaleX === 1 && scaleY === 1) return el;
    return {
      ...el,
      position: el.position
        ? { x: el.position.x * scaleX, y: el.position.y * scaleY }
        : el.position,
      size: el.size
        ? { width: el.size.width * scaleX, height: el.size.height * scaleY }
        : el.size,
    };
  };

  const trackItemsMap: Record<string, ITrackItem> = {};
  const captionIds: string[] = [];
  const videoIds: string[] = [];
  const audioIds: string[] = [];
  const textIds: string[] = [];

  let mainVideoSet = false;

  for (const rawEl of loaded.elements) {
    const el = scaleElement(rawEl);
    if (el.type === "video") {
      const item = buildVideoItem(el, canvasW, canvasH, !mainVideoSet);
      if (item) {
        trackItemsMap[item.id] = item;
        videoIds.push(item.id);
        mainVideoSet = true;
      }
    } else if (el.type === "image") {
      const item = buildImageItem(el, canvasW, canvasH);
      if (item) {
        trackItemsMap[item.id] = item;
        videoIds.push(item.id);
      }
    } else if (el.type === "shape") {
      const id = el.id;
      const from = el.startMs;
      const to = el.endMs;
      trackItemsMap[id] = {
        id,
        name: "Shape",
        type: "shape" as any,
        display: { from, to },
        details: {
          ...baseVisualDetails(canvasW, canvasH, el),
          shapeType: el.style?.shapeType ?? "cloud",
          color: (el.style?.color as string) ?? "#ffffff",
          ...(el.style ?? {})
        },
        metadata: { animation: el.animation, textOverlayMeta: el.textOverlayMeta },
      } as any;
      videoIds.push(id);
    } else if (el.type === "audio") {
      const item = buildAudioItem(el);
      if (item) {
        trackItemsMap[item.id] = item;
        audioIds.push(item.id);
      }
    } else if (el.type === "text" && el.text) {
      const id = el.id;
      const from = el.startMs;
      const to = el.endMs;
      trackItemsMap[id] = {
        id,
        name: "Text",
        type: "text",
        display: { from, to },
        details: {
          text: el.text,
          fontSize: (el.style?.fontSize as number) ?? 48,
          fontFamily: (el.style?.fontFamily as string) ?? SECONDARY_FONT,
          fontUrl: SECONDARY_FONT_URL,
          color: (el.style?.color as string) ?? "#ffffff",
          width: el.size?.width ?? 600,
          height: el.size?.height ?? 80,
          top: px(el.position?.y ?? canvasH * 0.4),
          left: px(el.position?.x ?? 80),
          opacity: opacityPercent(el.opacity),
          textAlign: "center",
          fontWeight: (el.style?.fontWeight as number) ?? 700,
          fontStyle: "normal",
          textDecoration: "none",
          lineHeight: "normal",
          letterSpacing: "normal",
          wordSpacing: "normal",
          wordWrap: "normal",
          wordBreak: "normal",
          border: "none",
          backgroundColor: (el.style?.backgroundColor as string) ?? "transparent",
          WebkitTextStrokeColor: (el.style?.WebkitTextStrokeColor as string) ?? "#000000",
          WebkitTextStrokeWidth: (el.style?.WebkitTextStrokeWidth as string) ?? "0px",
          borderWidth: 0,
          borderColor: "#000000",
          boxShadow: defaultBoxShadow(),
          textShadow: (el.style?.textShadow as string) ?? "none",
          textTransform: "capitalize",
          transform: el.rotation ? `rotate(${el.rotation}deg)` : "none",
          skewX: 0,
          skewY: 0,
          ...(el.style ?? {})
        },
        metadata: { animation: el.animation, textOverlayMeta: el.textOverlayMeta },
      } as ITrackItem;
      textIds.push(id);
    }
  }

  if (loaded.subtitleCues.length > 0) {
    // One caption item per cue (each with its own display window) so the export
    // shows exactly the cue the editor shows at each moment, instead of a single
    // master caption regrouped into arbitrary 7-word chunks.
    const sortedCues = [...loaded.subtitleCues].sort((a, b) => a.startMs - b.startMs);
    sortedCues.forEach((cue, i) => {
      if (!cue.text?.trim()) return;
      const cap = buildCaptionItem(
        cue,
        loaded.subtitleStyle,
        canvasW,
        canvasH,
        `caption-${cue.id ?? i}`,
      );
      trackItemsMap[cap.id] = cap;
      captionIds.push(cap.id);
    });
  }

  const tracks: ITrack[] = [];
  if (loaded.timeline?.tracks) {
    for (const t of loaded.timeline.tracks) {
      const validItems = t.clipIds.filter((id) => !!trackItemsMap[id]);
      if (validItems.length > 0) {
        tracks.push({
          id: t.id,
          type: (t.type === "voiceover" ? "audio" : t.type) as ITrack["type"],
          items: validItems,
          muted: t.muted,
          accepts: ["text", "image", "video", "audio", "caption", "template"],
          magnetic: false,
          static: false,
        });
      }
    }
  } else {
    if (captionIds.length) tracks.push(makeTrack("caption", captionIds));
    if (videoIds.length) tracks.push(makeTrack("video", videoIds));
    if (audioIds.length) tracks.push(makeTrack("audio", audioIds));
    if (textIds.length) tracks.push(makeTrack("text", textIds));
  }

  // Ensure caption track is present if it was stripped from the timeline clips but we have a master caption
  if (captionIds.length && !tracks.some((t) => t.items.some((id) => captionIds.includes(id)))) {
    tracks.push(makeTrack("caption", captionIds));
  }

  const trackItemIds = tracks.flatMap((t) => t.items);

  const transitionIds: string[] = [];
  const transitionsMap: Record<string, import("@designcombo/types").ITransition> = {};

  if (loaded.timeline?.transitions) {
    for (const t of loaded.timeline.transitions) {
      const track = loaded.timeline.tracks.find((tr) => tr.clipIds.includes(t.clipAId));
      if (!track) continue;

      const transitionId = t.id || `tr-${generateId()}`;
      transitionIds.push(transitionId);
      transitionsMap[transitionId] = {
        id: transitionId,
        trackId: track.id,
        fromId: t.clipAId,
        toId: t.clipBId,
        type: t.type || "fade",
        duration: t.durationMs || 500,
        kind: "add",
      };
    }
  }

  const durationMs = Math.max(
    ...Object.values(trackItemsMap).map((i) => i.display?.to ?? 0),
    1000 // Minimum 1 second duration
  );

  return {
    id: projectId,
    fps: FPS,
    size: { width: canvasW, height: canvasH },
    duration: durationMs,
    tracks,
    trackItemIds,
    trackItemsMap,
    transitionIds,
    transitionsMap,
    background: {
      type: "color",
      // Use the project's canvas background so letterbox/margin areas match the
      // editor instead of always exporting on black.
      value: loaded.timeline?.settings?.backgroundColor || "#000000",
    },
  };
}

export function designHasRenderableMedia(design: IDesign): boolean {
  return Object.values(design.trackItemsMap).some((item) => {
    if (item.type === "video" || item.type === "image" || item.type === "audio") {
      const src = (item.details as { src?: string })?.src;
      return Boolean(src?.trim());
    }
    return item.type === "caption" || item.type === "text";
  });
}
