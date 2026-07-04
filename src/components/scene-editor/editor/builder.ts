/**
 * buildTimelineFromProjectBundle
 * ------------------------------
 * Deterministically converts a ProjectBundle into a fully populated Timeline.
 * Tracks are created in this order:
 *   Scene Lane (data, not a track) | Media (video) | Media (image) |
 *   Fact | Text | Subtitle | Audio
 *
 * - Voiceover audio defines project duration.
 * - Media assets are evenly distributed across audio duration.
 * - Subtitle cues map 1:1 to SubtitleClips.
 * - Each extracted fact becomes a FactClip aligned to a script segment.
 * - Scenes are generated from ScriptVersion.segments (or paragraph split).
 */
import { nanoid } from "nanoid";
import type { ProjectBundle, ScriptSegment } from "./contract";
import type {
  AudioClip,
  Clip,
  FactClip,
  MediaClip,
  Scene,
  SubtitleClip,
  Timeline,
  Track,
} from "./schema";

const id = (prefix: string) => `${prefix}_${nanoid(8)}`;

function splitToSegments(text: string): ScriptSegment[] {
  const parts = text
    .split(/\n\s*\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((t, i) => ({ id: `seg-${i + 1}`, text: t }));
}

export function buildTimelineFromProjectBundle(bundle: ProjectBundle): Timeline {
  const {
    project,
    scriptVersion,
    audioAsset,
    subtitleTrack,
    extractedFacts,
    mediaAssets,
  } = bundle;

  const duration = Math.max(audioAsset.duration, 1);
  const segments =
    scriptVersion.segments && scriptVersion.segments.length > 0
      ? scriptVersion.segments
      : splitToSegments(scriptVersion.content);

  // Distribute segments across audio if they lack timing
  const segWithTimings = segments.map((s, i) => {
    if (s.start != null && s.end != null) return s;
    const slice = duration / segments.length;
    return { ...s, start: i * slice, end: (i + 1) * slice };
  });

  const tracks: Track[] = [
    { id: "tr-video", kind: "video", name: "Video", locked: false, hidden: false, muted: false, height: 64 },
    { id: "tr-image", kind: "image", name: "Image", locked: false, hidden: false, muted: false, height: 56 },
    { id: "tr-fact", kind: "fact", name: "Facts", locked: false, hidden: false, muted: false, height: 48 },
    { id: "tr-text", kind: "text", name: "Text", locked: false, hidden: false, muted: false, height: 48 },
    { id: "tr-subtitle", kind: "subtitle", name: "Subtitles", locked: false, hidden: false, muted: false, height: 48 },
    { id: "tr-voiceover", kind: "audio", name: "Voiceover", locked: false, hidden: false, muted: false, height: 56 },
    { id: "tr-music", kind: "audio", name: "Music", locked: false, hidden: false, muted: false, height: 48 },
  ];

  const clips: Clip[] = [];

  // ----- Voiceover -----
  const voiceover: AudioClip = {
    id: id("clip"),
    trackId: "tr-voiceover",
    kind: "audio",
    assetId: audioAsset.id,
    role: "voiceover",
    start: 0,
    duration,
    inPoint: 0,
    locked: false,
    hidden: false,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0.5,
    keyframes: { x: [], y: [], scale: [], rotation: [], opacity: [] },
  };
  clips.push(voiceover);

  // ----- Media (videos + images) distributed across duration -----
  const videos = mediaAssets.filter((m) => m.kind === "video");
  const images = mediaAssets.filter((m) => m.kind === "image");
  const visualAssets = [...videos, ...images].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  if (visualAssets.length > 0) {
    const slice = duration / visualAssets.length;
    visualAssets.forEach((m, i) => {
      const clipDuration =
        m.kind === "video" && m.duration ? Math.min(m.duration, slice) : slice;
      const mediaClip: MediaClip = {
        id: id("clip"),
        trackId: m.kind === "video" ? "tr-video" : "tr-image",
        kind: "media",
        mediaKind: m.kind,
        assetId: m.id,
        start: i * slice,
        duration: clipDuration,
        inPoint: 0,
        locked: false,
        hidden: false,
        opacity: 1,
        rotation: 0,
        speed: 1,
        volume: m.kind === "video" ? 0 : 0, // muted by default; voiceover is primary
        filter: { brightness: 0, contrast: 0, saturation: 0, preset: "none" },
        transitionIn: { kind: "fade", duration: 0.4 },
        transitionOut: { kind: "fade", duration: 0.4 },
        keyframes: { x: [], y: [], scale: [], rotation: [], opacity: [] },
      };
      clips.push(mediaClip);
    });
  }

  // ----- Subtitles -----
  subtitleTrack.cues.forEach((cue) => {
    const sub: SubtitleClip = {
      id: id("clip"),
      trackId: "tr-subtitle",
      kind: "subtitle",
      cueId: cue.id,
      text: cue.text,
      start: cue.start,
      duration: Math.max(cue.end - cue.start, 0.2),
      inPoint: 0,
      locked: false,
      hidden: false,
      preset: "modern",
      words: cue.words,
      keyframes: { x: [], y: [], scale: [], rotation: [], opacity: [] },
    };
    clips.push(sub);
  });

  // ----- Facts -----
  const factEntries = Object.entries(extractedFacts).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  factEntries.forEach(([key, value], i) => {
    const segment = segWithTimings[i % segWithTimings.length];
    const factText = formatFact(key, value);
    const fact: FactClip = {
      id: id("clip"),
      trackId: "tr-fact",
      kind: "fact",
      factKey: key,
      text: factText,
      start: segment.start ?? 0,
      duration: Math.max((segment.end ?? 2) - (segment.start ?? 0), 1.5),
      inPoint: 0,
      locked: false,
      hidden: false,
      animation: "slide-up",
      style: {
        fontFamily: "Inter",
        fontSize: 56,
        fontWeight: 800,
        color: "#ffffff",
        background: "rgba(0,0,0,0.45)",
        align: "center",
        strokeWidth: 0,
        shadow: true,
        x: 0.5,
        y: 0.22,
      },
      keyframes: { x: [], y: [], scale: [], rotation: [], opacity: [] },
    };
    clips.push(fact);
  });

  // ----- Scenes -----
  const scenes: Scene[] = segWithTimings.map((s, i) => ({
    id: `scene-${i + 1}`,
    title: `Scene ${i + 1}`,
    start: s.start ?? 0,
    duration: Math.max((s.end ?? 0) - (s.start ?? 0), 0.5),
    scriptSegmentId: s.id,
  }));

  return {
    version: 1,
    projectId: project.id,
    width: project.width ?? 1920,
    height: project.height ?? 1080,
    fps: project.fps ?? 30,
    duration,
    tracks,
    clips,
    scenes,
  };
}

function formatFact(key: string, value: string | number | boolean | null): string {
  const human = key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  if (typeof value === "number") return `${value.toLocaleString()} ${human}`;
  if (typeof value === "boolean") return human;
  return String(value);
}
