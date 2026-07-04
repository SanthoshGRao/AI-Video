import type { AiTimelinePlan } from "@/lib/timeline/ai-schema";
import type { TimelineMediaItem } from "@/lib/timeline/gather-context";

const MIN_SCENE_MS = 2500;

/**
 * Map narration sentences to media in order (round-robin).
 * Used when the LLM fails or returns invalid plans.
 */
export function planFromSentences(
  sentences: { text: string; startMs: number; endMs: number }[],
  media: TimelineMediaItem[],
  durationMs: number
): AiTimelinePlan {
  if (media.length === 0) {
    return { scenes: [], textOverlays: [] };
  }

  const segments =
    sentences.length > 0
      ? sentences.filter((s) => s.endMs > s.startMs && s.text.length > 0)
      : [{ text: "Full video", startMs: 0, endMs: durationMs }];

  const scenes: AiTimelinePlan["scenes"] = [];
  let mediaIdx = 0;

  for (const seg of segments) {
    let startMs = Math.max(0, seg.startMs);
    let endMs = Math.min(durationMs, seg.endMs);
    if (endMs - startMs < MIN_SCENE_MS) {
      endMs = Math.min(durationMs, startMs + MIN_SCENE_MS);
    }
    if (endMs <= startMs) continue;

    scenes.push({
      mediaAssetId: media[mediaIdx % media.length].id,
      startMs,
      endMs,
      narrationSegment: seg.text.slice(0, 200),
      transitionOut: "fade",
    });
    mediaIdx += 1;
  }

  if (scenes.length === 0) {
    const slot = Math.floor(durationMs / media.length);
    media.forEach((m, i) => {
      const startMs = i * slot;
      const endMs = i === media.length - 1 ? durationMs : (i + 1) * slot;
      scenes.push({
        mediaAssetId: m.id,
        startMs,
        endMs,
        transitionOut: i < media.length - 1 ? "fade" : undefined,
      });
    });
  }

  return normalizeScenePlan({ scenes, textOverlays: [] }, durationMs, media);
}

export function normalizeScenePlan(
  plan: AiTimelinePlan,
  durationMs: number,
  media: TimelineMediaItem[]
): AiTimelinePlan {
  const allowed = new Set(media.map((m) => m.id));
  let scenes = plan.scenes
    .filter((s) => allowed.has(s.mediaAssetId) && s.endMs > s.startMs)
    .map((s) => ({
      ...s,
      startMs: Math.max(0, Math.min(s.startMs, durationMs - 500)),
      endMs: Math.min(durationMs, Math.max(s.endMs, s.startMs + 500)),
    }))
    .sort((a, b) => a.startMs - b.startMs);

  if (scenes.length === 0 && media.length > 0) {
    const slot = Math.floor(durationMs / media.length);
    scenes = media.map((m, i) => ({
      mediaAssetId: m.id,
      startMs: i * slot,
      endMs: i === media.length - 1 ? durationMs : (i + 1) * slot,
      transitionOut: i < media.length - 1 ? ("fade" as const) : undefined,
    }));
  }

  // Remove overlaps by trimming earlier scene ends
  for (let i = 0; i < scenes.length - 1; i++) {
    if (scenes[i].endMs > scenes[i + 1].startMs) {
      scenes[i] = { ...scenes[i], endMs: scenes[i + 1].startMs };
    }
  }

  // Extend last scene to duration if gap > 500ms
  const last = scenes[scenes.length - 1];
  if (last && last.endMs < durationMs - 500) {
    scenes[scenes.length - 1] = { ...last, endMs: durationMs };
  }

  // Fill leading gap
  if (scenes[0]?.startMs > 500) {
    scenes[0] = { ...scenes[0], startMs: 0 };
  }

  const textOverlays = (plan.textOverlays ?? [])
    .filter((t) => t.endMs > t.startMs && t.text.trim())
    .map((t) => ({
      ...t,
      startMs: Math.max(0, t.startMs),
      endMs: Math.min(durationMs, t.endMs),
    }));

  return { scenes, textOverlays };
}
