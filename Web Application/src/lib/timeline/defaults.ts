import type { TimelineDocument, TimelineSettings, TimelineTrack } from "@/lib/timeline/types";

export const DEFAULT_TIMELINE_SETTINGS: TimelineSettings = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: 60_000,
  backgroundColor: "#0f172a",
  aspectRatio: "9:16",
};

export function createDefaultTracks(): TimelineTrack[] {
  const mk = (type: TimelineTrack["type"], name: string): TimelineTrack => ({
    id: `track-${type}`,
    type,
    name,
    muted: false,
    locked: type === "voiceover",
    clipIds: [],
  });

  return [
    mk("video", "Video"),
    mk("voiceover", "Voiceover"),
    mk("subtitle", "Subtitles"),
    mk("text", "Text overlays"),
  ];
}

export function createEmptyTimeline(
  durationMs = DEFAULT_TIMELINE_SETTINGS.durationMs
): TimelineDocument {
  return {
    tracks: createDefaultTracks(),
    clips: {},
    transitions: [],
    textLayers: [],
    settings: {
      ...DEFAULT_TIMELINE_SETTINGS,
      durationMs,
    },
  };
}
