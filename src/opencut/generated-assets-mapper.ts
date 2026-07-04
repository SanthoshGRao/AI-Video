import type { OpenCutProject, OpenCutTrack } from "./types";
import type { TimelineDocument, TimelineTrack, TimelineClip, TimelineTextLayer, TrackType } from "@/lib/timeline/types";

export function generatedAssetsToOpenCutProject(args: any): OpenCutProject {
  return {
    id: args.projectId || "temp-id",
    title: args.projectTitle || "Untitled",
    durationMs: args.audio?.durationMs || 10000,
    fps: 30,
    width: 1080,
    height: 1920,
    scene: {
      id: "main",
      type: "scene",
      tracks: []
    },
    media: [],
    formatVersion: "1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function openCutProjectToTimelineDocument(project: OpenCutProject): TimelineDocument {
  const tracks: TimelineTrack[] = [];
  const clips: Record<string, TimelineClip> = {};
  const textLayers: TimelineTextLayer[] = [];

  // scene.tracks may be a flat array (OpenCut format) OR a { main, overlay, audio }
  // object (core-editor scene format, as produced by the project mapper). Normalize
  // to a flat, ordered array so iteration never hits a non-iterable object.
  const rawTracks = project.scene?.tracks as
    | OpenCutTrack[]
    | { main?: OpenCutTrack; overlay?: OpenCutTrack[]; audio?: OpenCutTrack[] }
    | null
    | undefined;
  const trackList: OpenCutTrack[] = Array.isArray(rawTracks)
    ? rawTracks
    : rawTracks
      ? [
          ...(rawTracks.overlay ?? []),
          ...(rawTracks.main ? [rawTracks.main] : []),
          ...(rawTracks.audio ?? []),
        ]
      : [];

  for (const track of trackList) {
    if (!track) continue;
    const elements = track.elements ?? [];
    let trackType: TrackType = "video";
    if (track.name?.toLowerCase().includes("audio") || track.id.includes("audio")) trackType = "audio";
    if (track.name?.toLowerCase().includes("voice") || track.id.includes("voice")) trackType = "voiceover";
    if (track.name?.toLowerCase().includes("subtitle") || track.id.includes("sub")) trackType = "subtitle";
    if (
      track.name?.toLowerCase().includes("fact") ||
      track.id.includes("fact") ||
      track.name?.toLowerCase().includes("text") ||
      track.id.includes("text") ||
      track.name?.toLowerCase().includes("title") ||
      track.id.includes("title") ||
      track.id.includes("track-3")
    ) {
      trackType = "text";
    }
    
    tracks.push({
      id: track.id,
      type: trackType,
      name: track.name || track.id,
      muted: false,
      locked: false,
      clipIds: elements.map(el => el.id),
    });

    for (const el of elements) {
      if (el.type === "text") {
        textLayers.push({
          id: el.id,
          text: el.text || "",
          startTime: el.startMs,
          endTime: el.startMs + el.durationMs,
          style: el.style || {},
          animation: el.animation || "none",
          position: el.position || { x: 0.5, y: 0.5 },
        });
      } else {
        const media = project.media.find(m => m.id === el.mediaId);
        clips[el.id] = {
          id: el.id,
          trackId: track.id,
          mediaAssetId: media && trackType === "video" ? media.id.replace("media-", "") : undefined,
          audioAssetId: media && (trackType === "audio" || trackType === "voiceover") ? media.id.replace("media-", "") : undefined,
          type: (el.type === "voiceover" ? "audio" : el.type) as any,
          startTime: el.startMs,
          endTime: el.startMs + el.durationMs,
          trimStart: el.trimStartMs || 0,
          trimEnd: (el.trimStartMs || 0) + (el.trimDurationMs || el.durationMs),
          properties: {
            volume: el.volume,
          },
        };
      }
    }
  }

  return {
    tracks,
    clips,
    transitions: [],
    textLayers,
    settings: {
      width: project.width,
      height: project.height,
      fps: project.fps,
      durationMs: project.durationMs,
      backgroundColor: "#000000",
      aspectRatio: project.width > project.height ? "16:9" : project.width === project.height ? "1:1" : "9:16",
    }
  };
}
