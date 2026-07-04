import { createEmptyTimeline } from "@/lib/timeline/defaults";
import { syncTrackClipIds } from "@/lib/timeline/parse";
import type { TimelineClip, TimelineDocument } from "@/lib/timeline/types";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export type BootstrapInput = {
  durationSeconds: number;
  audio?: { id: string; durationMs: number } | null;
  media?: { id: string; type: string }[];
  subtitleTrackId?: string | null;
};

/**
 * Build an initial timeline: voiceover span + media split evenly on the video track.
 * Even split fallback; use generate-ai for script-aligned scenes.
 */
export function bootstrapTimeline(input: BootstrapInput): TimelineDocument {
  const durationMs =
    input.audio?.durationMs ??
    Math.max(15_000, (input.durationSeconds || 60) * 1000);

  const doc = createEmptyTimeline(durationMs);
  const clips: Record<string, TimelineClip> = {};

  const videoTrack = doc.tracks.find((t) => t.type === "video");
  const voiceTrack = doc.tracks.find((t) => t.type === "voiceover");
  const subTrack = doc.tracks.find((t) => t.type === "subtitle");

  if (input.audio && voiceTrack) {
    const id = uid("clip-vo");
    clips[id] = {
      id,
      trackId: voiceTrack.id,
      audioAssetId: input.audio.id,
      type: "audio",
      startTime: 0,
      endTime: durationMs,
      trimStart: 0,
      trimEnd: durationMs,
      properties: { label: "Voiceover" },
    };
  }

  const visualMedia = (input.media ?? []).filter((m) =>
    ["IMAGE", "VIDEO", "image", "video"].includes(m.type)
  );

  if (videoTrack && visualMedia.length > 0) {
    const slotMs = Math.floor(durationMs / visualMedia.length);
    visualMedia.forEach((m, i) => {
      const startTime = i * slotMs;
      const endTime =
        i === visualMedia.length - 1 ? durationMs : (i + 1) * slotMs;
      const id = uid("clip-vid");
      const isVideo = m.type === "VIDEO" || m.type === "video";
      clips[id] = {
        id,
        trackId: videoTrack.id,
        mediaAssetId: m.id,
        type: isVideo ? "video" : "image",
        startTime,
        endTime,
        trimStart: 0,
        trimEnd: endTime - startTime,
        properties: { slotIndex: i },
      };
    });
  }

  if (input.subtitleTrackId && subTrack) {
    const id = uid("clip-sub");
    clips[id] = {
      id,
      trackId: subTrack.id,
      subtitleTrackId: input.subtitleTrackId,
      type: "text",
      startTime: 0,
      endTime: durationMs,
      trimStart: 0,
      trimEnd: durationMs,
      properties: { label: "Subtitle track" },
    };
  }

  doc.clips = clips;
  doc.settings.durationMs = durationMs;

  return syncTrackClipIds(doc);
}
