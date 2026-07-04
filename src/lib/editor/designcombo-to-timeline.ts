import { createEmptyTimeline } from "@/lib/timeline/defaults";
import { syncTrackClipIds } from "@/lib/timeline/parse";
import type { TimelineClip, TimelineDocument } from "@/lib/timeline/types";
import type { ITrack, ITrackItem } from "@designcombo/types";

function parsePx(value: string | number | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number.parseFloat(String(value).replace("px", "")) || 0;
}

const SHAPE_ITEM_TYPES = new Set<string>([
  "shape",
  "illustration",
  "rect",
  "progressBar",
  "progressFrame",
  "progressSquare",
  "radialAudioBars",
  "linealAudioBars",
  "waveAudioBars",
  "hillAudioBars",
]);

function trackIdForItem(item: ITrackItem): string {
  if (item.type === "audio") return "track-voiceover";
  if (item.type === "caption") return "track-subtitle";
  if (item.type === "text") return "track-text";
  return "track-video";
}

function clipType(item: ITrackItem): TimelineClip["type"] {
  if (item.type === "video") return "video";
  if (item.type === "image") return "image";
  if (item.type === "audio") return "audio";
  // Shapes/illustrations must keep a renderable type — collapsing them to
  // "text" (with no text) made them silently disappear from exports.
  if (SHAPE_ITEM_TYPES.has(item.type)) return "shape";
  return "text";
}

export type DesigncomboPersistState = {
  tracks: ITrack[];
  trackItemsMap: Record<string, ITrackItem>;
  trackItemIds: string[];
  transitionIds?: string[];
  transitionsMap?: Record<string, import("@designcombo/types").ITransition>;
  size: { width: number; height: number };
  duration: number;
  fps: number;
};

/** Maps DesignCombo editor state → API timeline document (no schema changes). */
export function designStateToTimelineDocument(
  state: DesigncomboPersistState,
  mediaAssetByUrl?: Map<string, string>
): TimelineDocument {
  const durationMs = Math.ceil(
    Math.max(
      state.duration,
      ...Object.values(state.trackItemsMap).map((i) => i.display?.to ?? 0),
      1000
    )
  );

  const doc = createEmptyTimeline(durationMs);
  doc.settings.width = Math.round(state.size.width);
  doc.settings.height = Math.round(state.size.height);
  doc.settings.fps = Math.round(state.fps);

  const clips: Record<string, TimelineClip> = {};

  for (const id of state.trackItemIds) {
    const item = state.trackItemsMap[id];
    if (!item?.display) continue;

    const details = item.details ?? {};
    const trimFrom = item.trim?.from ?? 0;
    const trimTo =
      item.trim?.to ?? Math.max(item.display.to - item.display.from, 100);

    const src = details.src as string | undefined;
    const mediaAssetId =
      (item.metadata?.mediaAssetId as string | undefined) ??
      (src && mediaAssetByUrl?.get(src)) ??
      undefined;

    const opacityRaw = details.opacity as number | undefined;
    const opacity =
      opacityRaw != null
        ? opacityRaw > 1
          ? opacityRaw / 100
          : opacityRaw
        : 1;

    const rotateStr = String(details.rotate ?? "0deg");
    const rotation =
      Number.parseFloat(rotateStr.replace("deg", "")) ||
      Number.parseFloat(
        String(details.transform ?? "").match(/rotate\(([-\d.]+)deg\)/)?.[1] ??
          "0"
      ) ||
      0;

    clips[id] = {
      id,
      trackId: trackIdForItem(item),
      mediaAssetId,
      audioAssetId: item.metadata?.audioAssetId as string | undefined,
      type: clipType(item),
      startTime: item.display.from,
      endTime: item.display.to,
      trimStart: trimFrom,
      trimEnd: trimTo,
      properties: {
        position: {
          x: parsePx(details.left),
          y: parsePx(details.top),
        },
        size: {
          width: parsePx(details.width as string | number | undefined) || state.size.width,
          height: parsePx(details.height as string | number | undefined) || state.size.height,
        },
        rotation,
        opacity,
        text:
          item.type === "caption"
            ? (details.text as string)
            : item.type === "text"
              ? (details.text as string)
              : undefined,
        cueId: item.metadata?.cueId as string | undefined,
        locked: item.metadata?.locked ?? false,
        // Top-level so timelineDocumentToElements can rebuild shape/sticker elements
        kind: SHAPE_ITEM_TYPES.has(item.type)
          ? "shape"
          : ((details as Record<string, unknown>).kind as string | undefined),
        shapeType:
          ((details as Record<string, unknown>).shapeType as string | undefined) ??
          (SHAPE_ITEM_TYPES.has(item.type) ? item.type : undefined),
        emoji: (details as Record<string, unknown>).emoji as string | undefined,
        color: (details as Record<string, unknown>).color as string | undefined,
        style: {
          ...details,
          fontSize: details.fontSize,
          fontFamily: details.fontFamily,
          color: details.color,
        },
      },
    };
  }

  doc.clips = clips;

  doc.tracks = [
    {
      id: "track-video",
      type: "video",
      name: "Video",
      muted: false,
      locked: false,
      clipIds: [],
    },
    {
      id: "track-voiceover",
      type: "voiceover",
      name: "Voiceover",
      muted: false,
      locked: false,
      clipIds: [],
    },
    {
      id: "track-text",
      type: "text",
      name: "Text",
      muted: false,
      locked: false,
      clipIds: [],
    },
    {
      id: "track-subtitle",
      type: "subtitle",
      name: "Subtitles",
      muted: false,
      locked: false,
      clipIds: [],
    },
  ];

  if (state.transitionIds && state.transitionsMap) {
    const transitions: import("@/lib/timeline/types").TimelineTransition[] = [];
    for (const id of state.transitionIds) {
      const t = state.transitionsMap[id];
      if (!t) continue;
      transitions.push({
        id: t.id,
        type: (t.type as any) || "fade",
        clipAId: t.fromId,
        clipBId: t.toId,
        durationMs: t.duration || 500,
      });
    }
    doc.transitions = transitions;
  }

  return syncTrackClipIds(doc);
}

export function buildMediaUrlIndex(
  media: Array<{ id: string; r2Url: string }>
): Map<string, string> {
  const entries: Array<[string, string]> = [];
  for (const m of media) {
    entries.push([m.r2Url, m.id]);
    try {
      const parsed = new URL(m.r2Url);
      entries.push([parsed.toString(), m.id]);
      entries.push([`${parsed.origin}${parsed.pathname}`, m.id]);
    } catch {
      // Keep the raw URL mapping when parsing fails.
    }
  }
  return new Map(entries);
}
