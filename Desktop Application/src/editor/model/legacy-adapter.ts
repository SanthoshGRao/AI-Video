/**
 * legacy-adapter.ts — the ONLY place ms<->sec / Record<->array / legacy
 * `properties` grab-bag conversion happens. Converts between the DB wire
 * format (TimelineDocument, ms-based, `properties: Record<string,unknown>`)
 * and the canonical NativeProject model used internally by the native
 * editor and export engine.
 *
 * Every clip keeps its full original `properties` object in `NativeClip.raw`
 * and every project keeps its original `settings`/`textLayers` extras, so a
 * field this adapter doesn't know how to interpret is never silently
 * dropped on a load -> edit -> save round trip through the native editor —
 * it is preserved verbatim and typed fields are layered on top.
 */

import type {
  NativeProject,
  NativeTrack,
  NativeClip,
  NativeTransition,
  ClipTransform,
  EffectInstance,
  TrackKind,
} from "./types";
import type {
  TimelineDocument,
  TimelineTrack,
  TimelineClip,
  TimelineTransition,
  TimelineSettings,
  TrackType,
} from "./legacy-types";

const PRESET_EFFECT_IDS = new Set([
  "grayscale",
  "sepia",
  "vintage",
  "vivid",
  "cool",
  "warm",
  "invert",
]);

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/* ------------------------------------------------------------------ */
/*  TimelineDocument -> NativeProject                                  */
/* ------------------------------------------------------------------ */

export function fromTimelineDocument(
  timelineId: string,
  projectId: string,
  version: number,
  doc: TimelineDocument
): NativeProject {
  const tracks: NativeTrack[] = doc.tracks.map((t, index) => ({
    id: t.id,
    // Every legacy TrackType value ("video"|"audio"|"voiceover"|"text"|"subtitle")
    // is also a valid TrackKind — no mapping needed in this direction.
    kind: t.type as TrackKind,
    name: t.name,
    order: index,
    muted: t.muted,
    locked: t.locked,
    hidden: false,
  }));

  const trackIdByClipId = new Map<string, string>();
  for (const track of doc.tracks) {
    for (const clipId of track.clipIds) {
      trackIdByClipId.set(clipId, track.id);
    }
  }

  const clips: NativeClip[] = Object.values(doc.clips).map((c) =>
    clipFromLegacy(c, trackIdByClipId.get(c.id) ?? c.trackId)
  );

  const transitions: NativeTransition[] = doc.transitions.map((tr) =>
    transitionFromLegacy(tr, doc)
  );

  const settings = doc.settings;

  return {
    id: timelineId,
    projectId,
    version,
    fps: num(settings?.fps, 30),
    width: num(settings?.width, 1080),
    height: num(settings?.height, 1920),
    backgroundColor: settings?.backgroundColor ?? "#000000",
    durationSec: num(settings?.durationMs, 0) / 1000,
    tracks,
    clips,
    transitions,
  };
}

function clipFromLegacy(clip: TimelineClip, trackId: string): NativeClip {
  const props = isPlainObject(clip.properties) ? clip.properties : {};

  const position = isPlainObject(props.position) ? props.position : undefined;
  const size = isPlainObject(props.size) ? props.size : undefined;
  const transform: ClipTransform | undefined =
    position || size || props.rotation !== undefined || props.opacity !== undefined
      ? {
          x: num(position?.x, 0),
          y: num(position?.y, 0),
          w: num(size?.width, 100),
          h: num(size?.height, 100),
          rotationDeg: num(props.rotation, 0),
          opacity: num(props.opacity, 1),
        }
      : undefined;

  type PresetId = "grayscale" | "sepia" | "vintage" | "vivid" | "cool" | "warm" | "invert";
  const effects: EffectInstance[] = [];
  if (typeof props.effect === "string" && PRESET_EFFECT_IDS.has(props.effect)) {
    effects.push({ type: "preset", id: props.effect as PresetId });
  }

  const hasText = clip.type === "text" || clip.type === "subtitle" || typeof props.text === "string";
  const text = hasText
    ? {
        content: typeof props.text === "string" ? props.text : "",
        style: isPlainObject(props.style) ? props.style : {},
        animation: isPlainObject(props.animation)
          ? {
              entrance: typeof props.animation.entrance === "string" ? props.animation.entrance : undefined,
              exit: typeof props.animation.exit === "string" ? props.animation.exit : undefined,
              continuous: typeof props.animation.continuous === "string" ? props.animation.continuous : undefined,
            }
          : undefined,
      }
    : undefined;

  const hasAudio =
    clip.type === "audio" ||
    clip.type === "video" ||
    props.volume !== undefined ||
    props.muted !== undefined ||
    props.fadeIn !== undefined ||
    props.fadeOut !== undefined;
  const audio = hasAudio
    ? {
        volume: num(props.volume, 1),
        muted: props.muted === true,
        fadeInSec: num(props.fadeIn, 0),
        fadeOutSec: num(props.fadeOut, 0),
        solo: props.solo === true,
      }
    : undefined;

  return {
    id: clip.id,
    trackId,
    kind: clip.type,
    startSec: clip.startTime / 1000,
    endSec: clip.endTime / 1000,
    mediaInSec: clip.trimStart / 1000,
    mediaOutSec: clip.trimEnd / 1000,
    mediaAssetId: clip.mediaAssetId,
    audioAssetId: clip.audioAssetId,
    subtitleTrackId: clip.subtitleTrackId,
    cueId: typeof props.cueId === "string" ? props.cueId : undefined,
    transform,
    fit: props.fit === "cover" || props.fit === "contain" || props.fit === "fill" ? props.fit : undefined,
    effects,
    text,
    audio,
    playbackRate: typeof props.playbackRate === "number" ? props.playbackRate : undefined,
    raw: { ...props },
  };
}

function transitionFromLegacy(tr: TimelineTransition, doc: TimelineDocument): NativeTransition {
  const fromClip = doc.clips[tr.clipAId];
  const trackId = fromClip?.trackId ?? "";
  return {
    id: tr.id,
    trackId,
    fromClipId: tr.clipAId,
    toClipId: tr.clipBId,
    type: tr.type,
    durationSec: tr.durationMs / 1000,
  };
}

/* ------------------------------------------------------------------ */
/*  NativeProject -> TimelineDocument                                  */
/* ------------------------------------------------------------------ */

const LEGACY_TRACK_TYPE_FALLBACK: Record<string, TrackType> = {
  image: "video",
  overlay: "text",
};

/**
 * `base` is the previous TimelineDocument this NativeProject was loaded
 * from, if any — supplies settings/textLayers extras that NativeProject
 * doesn't model (subtitlePresetName, projectMediaIds, textLayers, etc.) so
 * they survive a save that only touched clips/tracks.
 */
export function toTimelineDocument(
  project: NativeProject,
  base?: TimelineDocument
): TimelineDocument {
  const tracks: TimelineTrack[] = [...project.tracks]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      id: t.id,
      type: (LEGACY_TRACK_TYPE_FALLBACK[t.kind] ?? t.kind) as TrackType,
      name: t.name,
      muted: t.muted,
      locked: t.locked,
      clipIds: project.clips.filter((c) => c.trackId === t.id).map((c) => c.id),
    }));

  const clips: Record<string, TimelineClip> = {};
  for (const clip of project.clips) {
    clips[clip.id] = clipToLegacy(clip);
  }

  const transitions: TimelineTransition[] = project.transitions.map((tr) => ({
    id: tr.id,
    type: tr.type,
    clipAId: tr.fromClipId,
    clipBId: tr.toClipId,
    durationMs: tr.durationSec * 1000,
  }));

  const settings: TimelineSettings = {
    ...base?.settings,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationMs: project.durationSec * 1000,
    backgroundColor: project.backgroundColor,
    aspectRatio: base?.settings?.aspectRatio ?? inferAspectRatio(project.width, project.height),
  };

  return {
    tracks,
    clips,
    transitions,
    textLayers: base?.textLayers ?? [],
    settings,
  };
}

function clipToLegacy(clip: NativeClip): TimelineClip {
  const properties: Record<string, unknown> = { ...clip.raw };

  if (clip.transform) {
    properties.position = { x: clip.transform.x, y: clip.transform.y };
    properties.size = { width: clip.transform.w, height: clip.transform.h };
    properties.rotation = clip.transform.rotationDeg;
    properties.opacity = clip.transform.opacity;
  }
  if (clip.fit) properties.fit = clip.fit;

  const presetEffect = clip.effects.find((e) => e.type === "preset");
  if (presetEffect && presetEffect.type === "preset") {
    properties.effect = presetEffect.id;
  } else if (clip.effects.length === 0 && "effect" in properties) {
    delete properties.effect;
  }

  if (clip.text) {
    properties.text = clip.text.content;
    properties.style = clip.text.style;
    if (clip.text.animation) properties.animation = clip.text.animation;
  }
  if (clip.audio) {
    properties.volume = clip.audio.volume;
    properties.muted = clip.audio.muted;
    properties.fadeIn = clip.audio.fadeInSec;
    properties.fadeOut = clip.audio.fadeOutSec;
    properties.solo = clip.audio.solo;
  }
  if (clip.playbackRate !== undefined) properties.playbackRate = clip.playbackRate;
  if (clip.cueId !== undefined) properties.cueId = clip.cueId;

  return {
    id: clip.id,
    trackId: clip.trackId,
    mediaAssetId: clip.mediaAssetId,
    audioAssetId: clip.audioAssetId,
    subtitleTrackId: clip.subtitleTrackId,
    type: clip.kind,
    startTime: clip.startSec * 1000,
    endTime: clip.endSec * 1000,
    trimStart: (clip.mediaInSec ?? 0) * 1000,
    trimEnd: (clip.mediaOutSec ?? 0) * 1000,
    properties,
  };
}

function inferAspectRatio(width: number, height: number): TimelineSettings["aspectRatio"] {
  const ratio = width / height;
  const candidates: Array<[TimelineSettings["aspectRatio"], number]> = [
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["1:1", 1],
    ["4:5", 4 / 5],
  ];
  let best = candidates[0];
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = Math.abs(c[1] - ratio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best[0];
}
