import { createEmptyTimeline } from "@/lib/timeline/defaults";
import { syncTrackClipIds } from "@/lib/timeline/parse";
import type { AiTimelinePlan } from "@/lib/timeline/ai-schema";
import type { TimelineGenerationContext } from "@/lib/timeline/gather-context";
import type {
  TimelineClip,
  TimelineDocument,
  TimelineTransition,
} from "@/lib/timeline/types";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildTimelineFromPlan(
  plan: AiTimelinePlan,
  ctx: TimelineGenerationContext
): TimelineDocument {
  const durationMs = ctx.durationMs;
  const doc = createEmptyTimeline(durationMs);
  const clips: Record<string, TimelineClip> = {};
  const transitions: TimelineTransition[] = [];
  const textLayers = plan.textOverlays.map((t, i) => ({
    id: `text-${i}`,
    text: t.text,
    startTime: t.startMs,
    endTime: t.endMs,
    style: {
      fontSize: 42,
      color: "#ffffff",
      backgroundColor: "rgba(15,23,42,0.65)",
    },
    animation: "fade",
    position: { x: 0.5, y: 0.85 },
  }));

  const videoTrack = doc.tracks.find((t) => t.type === "video");
  const voiceTrack = doc.tracks.find((t) => t.type === "voiceover");
  const subTrack = doc.tracks.find((t) => t.type === "subtitle");

  const mediaTypeById = new Map(
    ctx.media.map((m) => [m.id, m.type === "VIDEO" ? "video" : "image"] as const)
  );

  const videoClipIds: string[] = [];

  for (const scene of plan.scenes) {
    const clipType = mediaTypeById.get(scene.mediaAssetId) ?? "image";
    const id = uid("clip-vid");
    clips[id] = {
      id,
      trackId: videoTrack!.id,
      mediaAssetId: scene.mediaAssetId,
      type: clipType,
      startTime: scene.startMs,
      endTime: scene.endMs,
      trimStart: 0,
      trimEnd: scene.endMs - scene.startMs,
      properties: {
        label: scene.narrationSegment?.slice(0, 80) ?? "Scene",
        aiGenerated: true,
      },
    };
    videoClipIds.push(id);
  }

  for (let i = 0; i < plan.scenes.length - 1; i++) {
    const out = plan.scenes[i].transitionOut;
    if (!out || !videoClipIds[i] || !videoClipIds[i + 1]) continue;
    transitions.push({
      id: uid("tr"),
      type: out,
      clipAId: videoClipIds[i],
      clipBId: videoClipIds[i + 1],
      durationMs: 400,
    });
  }

  if (voiceTrack) {
    const id = uid("clip-vo");
    clips[id] = {
      id,
      trackId: voiceTrack.id,
      audioAssetId: ctx.audio.id,
      type: "audio",
      startTime: 0,
      endTime: durationMs,
      trimStart: 0,
      trimEnd: durationMs,
      properties: { label: "Voiceover" },
    };
  }

  if (ctx.subtitleTrackId && subTrack) {
    const id = uid("clip-sub");
    clips[id] = {
      id,
      trackId: subTrack.id,
      subtitleTrackId: ctx.subtitleTrackId,
      type: "subtitle",
      startTime: 0,
      endTime: durationMs,
      trimStart: 0,
      trimEnd: durationMs,
      properties: { label: "Subtitles" },
    };
  }

  doc.clips = clips;
  doc.transitions = transitions;
  doc.textLayers = textLayers;
  doc.settings.durationMs = durationMs;

  return syncTrackClipIds(doc);
}
