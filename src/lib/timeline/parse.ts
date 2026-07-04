import type {
  TimelineClip,
  TimelineDocument,
  TimelineSettings,
  TimelineTextLayer,
  TimelineTrack,
  TimelineTransition,
} from "@/lib/timeline/types";
import {
  DEFAULT_TIMELINE_SETTINGS,
  createDefaultTracks,
  createEmptyTimeline,
} from "@/lib/timeline/defaults";

function parseTracks(raw: unknown): TimelineTrack[] {
  if (!Array.isArray(raw) || raw.length === 0) return createDefaultTracks();
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t, i) => {
      const o = t as Record<string, unknown>;
      const type = String(o.type ?? "video") as TimelineTrack["type"];
      return {
        id: String(o.id ?? `track-${i}`),
        type,
        name: String(o.name ?? type),
        muted: Boolean(o.muted),
        locked: Boolean(o.locked),
        clipIds: Array.isArray(o.clipIds)
          ? (o.clipIds as unknown[]).map(String)
          : [],
      };
    });
}

function parseClips(raw: unknown): Record<string, TimelineClip> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, TimelineClip> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val || typeof val !== "object") continue;
    const o = val as Record<string, unknown>;
    const id = String(o.id ?? key);
    out[id] = {
      id,
      trackId: String(o.trackId ?? ""),
      mediaAssetId: o.mediaAssetId ? String(o.mediaAssetId) : undefined,
      audioAssetId: o.audioAssetId ? String(o.audioAssetId) : undefined,
      subtitleTrackId: o.subtitleTrackId
        ? String(o.subtitleTrackId)
        : undefined,
      type: (String(o.type ?? "video") as TimelineClip["type"]) || "video",
      startTime: Number(o.startTime) || 0,
      endTime: Number(o.endTime) || 0,
      trimStart: Number(o.trimStart) || 0,
      trimEnd: Number(o.trimEnd) || 0,
      properties:
        o.properties && typeof o.properties === "object"
          ? (o.properties as Record<string, unknown>)
          : {},
    };
  }
  return out;
}

function parseSettings(raw: unknown): TimelineSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TIMELINE_SETTINGS };
  const o = raw as Record<string, unknown>;
  const ar = String(o.aspectRatio ?? "9:16");
  const aspectRatio =
    ar === "16:9" || ar === "1:1" || ar === "4:5" ? (ar as TimelineSettings["aspectRatio"]) : ("9:16" as const);
  return {
    width: Number(o.width) || DEFAULT_TIMELINE_SETTINGS.width,
    height: Number(o.height) || DEFAULT_TIMELINE_SETTINGS.height,
    fps: Number(o.fps) || DEFAULT_TIMELINE_SETTINGS.fps,
    durationMs:
      Number(o.durationMs) || DEFAULT_TIMELINE_SETTINGS.durationMs,
    backgroundColor:
      String(o.backgroundColor ?? DEFAULT_TIMELINE_SETTINGS.backgroundColor),
    aspectRatio,
  };
}

function parseTransitions(raw: unknown): TimelineTransition[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t, i) => {
      const o = t as Record<string, unknown>;
      return {
        id: String(o.id ?? `tr-${i}`),
        type: (String(o.type ?? "fade") as TimelineTransition["type"]) || "fade",
        clipAId: String(o.clipAId ?? ""),
        clipBId: String(o.clipBId ?? ""),
        durationMs: Number(o.durationMs) || 400,
      };
    });
}

function parseTextLayers(raw: unknown): TimelineTextLayer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t, i) => {
      const o = t as Record<string, unknown>;
      const pos = o.position as { x?: number; y?: number } | undefined;
      return {
        id: String(o.id ?? `text-${i}`),
        text: String(o.text ?? ""),
        startTime: Number(o.startTime) || 0,
        endTime: Number(o.endTime) || 0,
        style:
          o.style && typeof o.style === "object"
            ? (o.style as Record<string, unknown>)
            : {},
        animation: String(o.animation ?? "none"),
        position: {
          x: Number(pos?.x) || 0,
          y: Number(pos?.y) || 0,
        },
      };
    });
}

export function parseTimelineRow(row: {
  tracks: unknown;
  clips: unknown;
  transitions?: unknown;
  textLayers?: unknown;
  settings?: unknown;
}): TimelineDocument {
  const tracks = parseTracks(row.tracks);
  const clips = parseClips(row.clips);
  const settings = parseSettings(row.settings);
  return {
    tracks,
    clips,
    transitions: parseTransitions(row.transitions),
    textLayers: parseTextLayers(row.textLayers),
    settings,
  };
}

export function parseTimelineJson(
  tracks: unknown,
  clips: unknown,
  transitions?: unknown,
  textLayers?: unknown,
  settings?: unknown
): TimelineDocument {
  return parseTimelineRow({
    tracks,
    clips,
    transitions,
    textLayers,
    settings,
  });
}

export function emptyTimelineDocument(durationMs?: number): TimelineDocument {
  return createEmptyTimeline(durationMs);
}

/** Ensure track.clipIds match clips on that track. */
export function syncTrackClipIds(doc: TimelineDocument): TimelineDocument {
  const byTrack = new Map<string, string[]>();
  for (const clip of Object.values(doc.clips)) {
    const list = byTrack.get(clip.trackId) ?? [];
    list.push(clip.id);
    byTrack.set(clip.trackId, list);
  }
  for (const [trackId, ids] of byTrack) {
    ids.sort(
      (a, b) =>
        (doc.clips[a]?.startTime ?? 0) - (doc.clips[b]?.startTime ?? 0)
    );
    byTrack.set(trackId, ids);
  }
  const tracks = doc.tracks.map((t) => ({
    ...t,
    clipIds: byTrack.get(t.id) ?? [],
  }));
  return { ...doc, tracks };
}

export function timelineDurationMs(doc: TimelineDocument): number {
  let max = doc.settings.durationMs;
  for (const clip of Object.values(doc.clips)) {
    if (clip.endTime > max) max = clip.endTime;
  }
  for (const layer of doc.textLayers) {
    if (layer.endTime > max) max = layer.endTime;
  }
  return max;
}
