import type { OpenCutProject, OpenCutTrack } from "./types";
import type { TimelineDocument, TimelineTrack, TimelineClip, TimelineTextLayer, TrackType } from "@/lib/timeline/types";

function inferTrackType(track: OpenCutTrack, position: "main" | "overlay" | "audio"): TrackType {
  if (position === "audio") return "voiceover";
  if (position === "main") return "video";
  // Overlay tracks: subtitles and fact overlays use the stable ids their
  // builders assign (subtitle-track-builder.ts / fact-overlay-builder.ts);
  // anything else in the overlay slot is the image track (video-typed).
  if (track.id === "subtitles") return "subtitle";
  if (track.id === "facts") return "text";
  return "video";
}

export function openCutProjectToTimelineDocument(project: OpenCutProject): TimelineDocument {
  const tracks: TimelineTrack[] = [];
  const clips: Record<string, TimelineClip> = {};
  const textLayers: TimelineTextLayer[] = [];

  const rawTracks = project.scene?.tracks;
  const positioned: { track: OpenCutTrack; position: "main" | "overlay" | "audio" }[] = [
    ...(rawTracks?.overlay ?? []).map((track) => ({ track, position: "overlay" as const })),
    ...(rawTracks?.main ? [{ track: rawTracks.main, position: "main" as const }] : []),
    ...(rawTracks?.audio ?? []).map((track) => ({ track, position: "audio" as const })),
  ];

  for (const { track, position } of positioned) {
    if (!track) continue;
    const elements = track.elements ?? [];
    const trackType = inferTrackType(track, position);

    tracks.push({
      id: track.id,
      type: trackType,
      name: track.name || track.id,
      muted: false,
      locked: false,
      clipIds: elements.map((el) => el.id),
    });

    for (const el of elements) {
      const startTime = el.startTime;
      const endTime = el.startTime + el.duration;

      if (el.type === "text") {
        textLayers.push({
          id: el.id,
          text: el.text || "",
          startTime,
          endTime,
          style: el.params || {},
          animation: el.animation || "none",
          position: { x: 0.5, y: 0.5 },
        });
      } else {
        const media = project.media.find((m) => m.id === el.mediaId);
        clips[el.id] = {
          id: el.id,
          trackId: track.id,
          mediaAssetId: media && trackType === "video" ? media.id : undefined,
          audioAssetId: media && (trackType === "audio" || trackType === "voiceover") ? media.id : undefined,
          type: (el.type === "voiceover" ? "audio" : el.type) as TimelineClip["type"],
          startTime,
          endTime,
          trimStart: el.trimStart,
          trimEnd: el.trimEnd,
          properties: {
            volume: el.volume,
          },
        };
      }
    }
  }

  const width = project.settings.canvasSize.width;
  const height = project.settings.canvasSize.height;

  return {
    tracks,
    clips,
    transitions: [],
    textLayers,
    settings: {
      width,
      height,
      fps: project.settings.fps,
      durationMs: project.durationMs,
      backgroundColor: project.settings.background?.color || "#000000",
      aspectRatio: width > height ? "16:9" : width === height ? "1:1" : "9:16",
    },
  };
}
