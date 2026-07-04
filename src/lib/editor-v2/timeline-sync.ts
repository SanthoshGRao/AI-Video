import { ASPECTS, PX_PER_SECOND, type Clip, type ClipKind, type Track, type TrackKind } from "./editor-data";
import type { StageElement, StageElementKind, Transition, TransitionId } from "./editor-store";
import { clipLayerZIndex } from "./layer-priority";
import type { TimelineClip, TimelineDocument, TimelineTrack, TimelineTransition } from "@/lib/timeline/types";
import { syncTrackClipIds } from "@/lib/timeline/parse";

type AspectId = (typeof ASPECTS)[number]["id"];

function trackType(kind: Track["kind"]) {
  if (kind === "audio") return "audio";
  if (kind === "subtitle") return "subtitle";
  if (kind === "text") return "text";
  return "video";
}

function clipType(kind: Clip["kind"]) {
  if (kind === "audio") return "audio";
  if (kind === "image") return "image";
  if (kind === "subtitle") return "text";
  if (kind === "text") return "text";
  if (kind === "overlay") return "image";
  return "video";
}

function normalizeAspectRatio(aspect: AspectId): "9:16" | "16:9" | "1:1" | "4:5" {
  if (aspect === "16:9" || aspect === "1:1" || aspect === "4:5") return aspect;
  return "9:16";
}

function transitionType(kind: Transition["kind"]) {
  if (kind === "zoom") return "zoom";
  if (kind === "slide" || kind === "wipe") return "slide";
  if (kind === "dissolve" || kind === "fade") return "fade";
  return "fade";
}

function elementStyle(el?: StageElement) {
  if (!el) return {};
  return {
    fontFamily: el.fontFamily,
    fontSize: el.fontSize,
    fontWeight: el.fontWeight,
    color: el.color,
    italic: el.italic,
    underline: el.underline,
    align: el.align,
    letterSpacing: el.letterSpacing,
    opacity: el.opacity,
    effect: el.effect,
    backgroundColor: el.backgroundColor,
    backgroundOpacity: el.backgroundOpacity,
    WebkitTextStroke: el.stroke ? `${el.strokeWidth || 1}px ${el.strokeColor || "#000"}` : undefined,
    textShadow: el.shadow ? "0px 4px 10px rgba(0,0,0,0.5)" : undefined,
    highlightColor: el.highlightColor,
    animation: el.animation,
  };
}

export function buildTimelineSaveBody(input: {
  aspect: AspectId;
  background: string;
  clips: Clip[];
  elements: StageElement[];
  tracks: Track[];
  transitions: Transition[];
  fps: number;
  isAutosave?: boolean;
}) {
  const aspect = ASPECTS.find((a) => a.id === input.aspect) ?? ASPECTS[1];
  const clips: Record<string, unknown> = {};

  for (const clip of input.clips) {
    const el = clip.elementId ? input.elements.find((e) => e.id === clip.elementId) : undefined;
    const startTime = Math.max(0, Math.round((clip.start / PX_PER_SECOND) * 1000));
    const endTime = Math.max(startTime + 1, Math.round(((clip.start + clip.width) / PX_PER_SECOND) * 1000));
    const isSubtitle = clip.kind === "subtitle";
    const isTitle = clip.kind === "text" && el?.studioOverlay === "title";
    clips[clip.id] = {
      id: clip.id,
      trackId: `track-${clip.track}`,
      mediaAssetId: clip.mediaAssetId,
      type: clipType(clip.kind),
      startTime,
      endTime,
      trimStart: Math.round((clip.mediaStart ?? 0) * 1000),
      trimEnd: Math.round(((clip.mediaStart ?? 0) + clip.width / PX_PER_SECOND) * 1000),
      playbackRate: clip.playbackRate ?? 1,
      properties: {
        src: clip.src ?? el?.src,
        // Per-clip audio mixer (video sound + audio clips). Persist so the
        // export honours the exact mute/volume the user set in the editor.
        muted: clip.audio?.muted ?? false,
        volume: clip.audio?.volume ?? 1,
        text: el?.text ?? (clip.kind === "text" || clip.kind === "subtitle" ? clip.name : undefined),
        zIndex: clipLayerZIndex(clip.kind),
        position: el
          ? { x: (el.x / 100) * aspect.w, y: (el.y / 100) * aspect.h }
          : { x: 0, y: 0 },
        size: el
          ? { width: (el.w / 100) * aspect.w, height: (el.h / 100) * aspect.h }
          : { width: aspect.w, height: aspect.h },
        rotation: el?.rotation ?? 0,
        opacity: (el?.opacity ?? 100) / 100,
        fit: el?.fit ?? "cover",
        style: elementStyle(el),
        emoji: el?.emoji,
        shapeType: el?.shapeType,
        color: el?.color,
        kind: el?.kind,
        ...(isSubtitle ? { textOverlayMeta: { category: "subtitle" } } : {}),
        ...(isTitle ? { textOverlayMeta: { category: "title" } } : {}),
      },
    };
  }

  const durationMs = Math.max(1000, ...Object.values(clips).map((clip) => (clip as { endTime: number }).endTime));

  return {
    tracks: input.tracks.map((track) => ({
      id: `track-${track.id}`,
      type: trackType(track.kind),
      name: track.label,
      muted: !!track.muted,
      locked: !!track.locked,
      clipIds: input.clips.filter((clip) => clip.track === track.id).map((clip) => clip.id),
    })),
    clips,
    transitions: input.transitions.map((tr) => {
      // Prefer the clip ids captured when the transition was created — only
      // fall back to guessing from track position if a clip was since
      // deleted and the reference has gone stale.
      const clipIds = new Set(input.clips.map((c) => c.id));
      let clipAId = tr.clipAId;
      let clipBId = tr.clipBId;
      if (!clipIds.has(clipAId) || !clipIds.has(clipBId)) {
        const ordered = input.clips.filter((c) => c.track === tr.track).sort((a, b) => a.start - b.start);
        const clipA = [...ordered].reverse().find((c) => c.start + c.width <= tr.start + 1) ?? ordered[0];
        const clipB = ordered.find((c) => c.start >= tr.start - 1) ?? ordered[1] ?? clipA;
        clipAId = clipA?.id ?? "";
        clipBId = clipB?.id ?? clipA?.id ?? "";
      }
      return {
        id: tr.id,
        type: transitionType(tr.kind),
        clipAId,
        clipBId,
        durationMs: Math.max(1, Math.round(tr.duration * 1000)),
      };
    }).filter((tr) => tr.clipAId && tr.clipBId),
    textLayers: [],
    settings: {
      width: aspect.w,
      height: aspect.h,
      fps: input.fps,
      durationMs,
      backgroundColor: input.background,
      aspectRatio: normalizeAspectRatio(input.aspect),
    },
    isAutosave: input.isAutosave ?? false,
  };
}

export async function saveEditorTimeline(projectId: string, isAutosave = false) {
  const { useEditor } = await import("./editor-store");
  const state = useEditor.getState();
  const body = buildTimelineSaveBody({
    aspect: state.aspect,
    background: state.background,
    clips: state.clips,
    elements: state.elements,
    tracks: state.tracks,
    transitions: state.transitions,
    fps: state.settings.fps,
    isAutosave,
  });
  const res = await fetch(`/api/projects/${projectId}/timeline`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `Timeline save failed: ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error) detail = String(err.error);
      else if (err?.message) detail = String(err.message);
      const fieldErrors = err?.details?.fieldErrors as Record<string, string[] | undefined> | undefined;
      if (fieldErrors) {
        const first = Object.entries(fieldErrors).find(([, msgs]) => msgs?.length);
        if (first) detail = `${detail}: ${first[0]} — ${first[1]![0]}`;
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

/** Snapshot of the live editor state as a canonical timeline document (for export). */
export function getEditorTimelineSnapshot(state: {
  aspect: AspectId;
  background: string;
  clips: Clip[];
  elements: StageElement[];
  tracks: Track[];
  transitions: Transition[];
  settings: { fps: number };
}): TimelineDocument {
  const body = buildTimelineSaveBody({
    aspect: state.aspect,
    background: state.background,
    clips: state.clips,
    elements: state.elements,
    tracks: state.tracks,
    transitions: state.transitions,
    fps: state.settings.fps,
    isAutosave: false,
  });
  return syncTrackClipIds({
    tracks: body.tracks as TimelineTrack[],
    clips: body.clips as TimelineDocument["clips"],
    transitions: body.transitions as TimelineTransition[],
    textLayers: body.textLayers,
    settings: body.settings as any,
  });
}

function parseTrackNumericId(trackId: string): number {
  const match = trackId.match(/^track-(\d+)$/);
  if (match) return Number(match[1]);
  if (trackId === "track-text" || trackId === "track-facts" || trackId.includes("text") || trackId.includes("fact") || trackId.includes("title")) return 3;
  if (trackId === "track-audio" || trackId === "track-voiceover" || trackId.includes("audio") || trackId.includes("voice")) return 4;
  if (trackId === "track-subtitle" || trackId.includes("sub")) return 5;
  if (trackId === "track-video" || trackId.includes("video")) return 1;
  if (trackId === "track-image" || trackId.includes("image")) return 2;
  if (trackId === "track-music" || trackId.includes("music")) return 6;
  return 1;
}

function editorTrackKind(type: TimelineTrack["type"]): TrackKind {
  if (type === "audio" || type === "voiceover") return "audio";
  if (type === "subtitle") return "subtitle";
  if (type === "text") return "text";
  return "video";
}

function editorClipKind(clip: TimelineClip): ClipKind {
  const meta = clip.properties?.textOverlayMeta as { category?: string } | undefined;
  if (meta?.category === "subtitle" || clip.type === "subtitle") return "subtitle";
  if (clip.type === "text") return "text";
  if (clip.properties?.emoji || clip.properties?.shapeType || clip.properties?.kind === "shape" || clip.properties?.kind === "sticker" || clip.properties?.kind === "overlay") return "overlay";
  if (clip.type === "image") return "image";
  if (clip.type === "audio") return "audio";
  return "video";
}

function editorTransitionKind(type: TimelineTransition["type"]): TransitionId {
  if (type === "zoom") return "zoom";
  if (type === "slide" || type === "push") return "slide";
  if (type === "blur") return "dissolve";
  return "fade";
}

function styleToElement(style: Record<string, unknown> | undefined, el: StageElement): StageElement {
  if (!style) return el;
  const stroke = style.WebkitTextStroke as string | undefined;
  const strokeMatch = stroke?.match(/^([\d.]+)px\s+(.+)$/);
  const strokeVal = typeof style.stroke === "boolean" ? style.stroke : (strokeMatch ? true : el.stroke);
  const strokeColorVal = (style.strokeColor as string) ?? strokeMatch?.[2] ?? el.strokeColor;
  const strokeWidthVal = typeof style.strokeWidth === "number" ? style.strokeWidth : (strokeMatch ? Number(strokeMatch[1]) : el.strokeWidth);

  return {
    ...el,
    fontFamily: (style.fontFamily as string) ?? el.fontFamily,
    fontSize: typeof style.fontSize === "number" ? style.fontSize : el.fontSize,
    fontWeight: typeof style.fontWeight === "number" ? style.fontWeight : el.fontWeight,
    color: (style.color as string) ?? el.color,
    italic: style.italic === true || style.fontStyle === "italic" ? true : el.italic,
    underline: style.underline === true || style.textDecoration === "underline" ? true : el.underline,
    align: (style.align as StageElement["align"]) ?? (style.textAlign as StageElement["align"]) ?? el.align,
    letterSpacing: typeof style.letterSpacing === "number" ? style.letterSpacing : el.letterSpacing,
    opacity: typeof style.opacity === "number" ? style.opacity * 100 : el.opacity,
    backgroundColor: (style.backgroundColor as string) ?? el.backgroundColor,
    stroke: strokeVal,
    strokeColor: strokeColorVal,
    strokeWidth: strokeWidthVal,
    shadow: (style.textShadow && style.textShadow !== "none") ? true : style.shadow === true ? true : el.shadow,
    highlightColor: (style.highlightColor as string) ?? el.highlightColor,
    animation: (style.animation as string) ?? el.animation,
  };
}

/** Restore editor-v2 clips/elements from a saved timeline document. */
export function timelineDocumentToEditorState(doc: TimelineDocument): {
  clips: Clip[];
  elements: StageElement[];
  tracks: Track[];
  transitions: Transition[];
  background: string;
  aspect: AspectId;
  fps: 24 | 30 | 60;
} {
  const aspectFromSettings = doc.settings.aspectRatio as AspectId;
  const aspect = ASPECTS.find((a) => a.id === aspectFromSettings) ?? ASPECTS.find((a) => a.w === doc.settings.width && a.h === doc.settings.height) ?? ASPECTS[1];

  const rawTracks: Track[] = doc.tracks.map((t) => ({
    id: parseTrackNumericId(t.id),
    kind: editorTrackKind(t.type),
    label: t.name,
    muted: t.muted,
    locked: t.locked,
  }));

  const uniqueTracksMap = new Map<number, Track>();
  for (const t of rawTracks) {
    const existing = uniqueTracksMap.get(t.id);
    if (!existing) {
      uniqueTracksMap.set(t.id, t);
    } else {
      uniqueTracksMap.set(t.id, {
        ...existing,
        muted: existing.muted || t.muted,
        locked: existing.locked || t.locked,
        label: (existing.label === "Video" || existing.label === "Images & Videos") ? t.label : existing.label,
      });
    }
  }
  const tracks = Array.from(uniqueTracksMap.values());

  const clips: Clip[] = [];
  const elements: StageElement[] = [];

  for (const clip of Object.values(doc.clips)) {
    const props = clip.properties ?? {};
    const meta = props.textOverlayMeta as { category?: string } | undefined;
    const kind = editorClipKind(clip);
    const trackNum = parseTrackNumericId(clip.trackId);
    const startPx = (clip.startTime / 1000) * PX_PER_SECOND;
    const widthPx = Math.max(1, ((clip.endTime - clip.startTime) / 1000) * PX_PER_SECOND);
    const pos = props.position as { x?: number; y?: number } | undefined;
    const size = props.size as { width?: number; height?: number } | undefined;
    const style = props.style as Record<string, unknown> | undefined;
    const elementId = kind === "audio" ? undefined : `el-${clip.id}`;

    if (elementId) {
      let el: StageElement = {
        id: elementId,
        kind: (props.kind as StageElementKind) ?? (kind === "subtitle" || kind === "text" ? "text" : kind === "image" ? "image" : kind === "video" ? "video" : "rect"),
        x: pos?.x != null ? (pos.x / aspect.w) * 100 : 0,
        y: pos?.y != null ? (pos.y / aspect.h) * 100 : 0,
        w: size?.width != null ? (size.width / aspect.w) * 100 : 100,
        h: size?.height != null ? (size.height / aspect.h) * 100 : 100,
        rotation: Number(props.rotation ?? 0),
        text: String(props.text ?? clip.id),
        color: (props.color as string) ?? "#ffffff",
        opacity: typeof props.opacity === "number" ? props.opacity * 100 : 100,
        fit: (props.fit as "cover" | "contain" | undefined) ?? "cover",
        src: props.src as string | undefined,
        emoji: props.emoji as string | undefined,
        shapeType: props.shapeType as string | undefined,
        studioOverlay: meta?.category === "subtitle" ? "subtitle" : meta?.category === "title" ? "title" : undefined,
      };
      el = styleToElement(style, el);
      el.source = "user";
      elements.push(el);
    }

    clips.push({
      id: clip.id,
      kind,
      name: String(props.text ?? clip.id).slice(0, 40) || "Clip",
      start: startPx,
      width: widthPx,
      track: trackNum,
      src: props.src as string | undefined,
      mediaAssetId: clip.mediaAssetId,
      mediaStart: (clip.trimStart ?? 0) / 1000,
      elementId,
      color: "#6366f1",
      source: "user",
      playbackRate: (clip as any).playbackRate ?? (props as any).playbackRate ?? 1,
    });
  }

  // Round and snap adjacent subtitle clips to prevent timeline visual gaps on reload
  const subtitleClips = clips.filter((c) => c.kind === "subtitle");
  const tracksWithSubtitles = new Set(subtitleClips.map((c) => c.track));
  for (const trackId of tracksWithSubtitles) {
    const trackSubClips = subtitleClips.filter((c) => c.track === trackId).sort((a, b) => a.start - b.start);
    for (let i = 0; i < trackSubClips.length; i++) {
      const c = trackSubClips[i];
      c.start = Math.round(c.start);
      c.width = Math.round(c.width);
      if (i > 0) {
        const prev = trackSubClips[i - 1];
        const prevEnd = prev.start + prev.width;
        // Snap if contiguous or nearly contiguous (within 5 pixels)
        if (Math.abs(c.start - prevEnd) <= 5) {
          const diff = prevEnd - c.start;
          c.start = prevEnd;
          c.width = Math.max(4, c.width - diff);
        }
      }
    }
  }

  const transitions: Transition[] = doc.transitions.map((tr) => {
    const clipB = doc.clips[tr.clipBId];
    const trackNum = clipB ? parseTrackNumericId(clipB.trackId) : 1;
    const startPx = clipB ? (clipB.startTime / 1000) * PX_PER_SECOND : 0;
    return {
      id: tr.id,
      kind: editorTransitionKind(tr.type),
      track: trackNum,
      start: startPx,
      duration: tr.durationMs / 1000,
      clipAId: tr.clipAId,
      clipBId: tr.clipBId,
    };
  });

  const fpsRaw = doc.settings.fps;
  const fps: 24 | 30 | 60 = fpsRaw === 24 || fpsRaw === 60 ? fpsRaw : 30;

  return {
    clips,
    elements,
    tracks: tracks.length ? tracks : [{ id: 1, kind: "video", label: "Video 1" }],
    transitions,
    background: doc.settings.backgroundColor ?? "#0f172a",
    aspect: aspect.id,
    fps,
  };
}

export type ExportResolution =
  | "1080x1920"
  | "720x1280"
  | "1920x1080"
  | "1280x720"
  | "1080x1080"
  | "1080x1350";

export function exportResolutionForAspect(
  aspectId: AspectId,
  tier: "720" | "1080" = "1080",
): ExportResolution {
  switch (aspectId) {
    case "16:9":
      return tier === "720" ? "1280x720" : "1920x1080";
    case "1:1":
      return "1080x1080";
    case "4:5":
      return "1080x1350";
    case "9:16":
    default:
      return tier === "720" ? "720x1280" : "1080x1920";
  }
}

export function resolutionForAspect(aspectId: AspectId) {
  return exportResolutionForAspect(aspectId, "1080");
}
