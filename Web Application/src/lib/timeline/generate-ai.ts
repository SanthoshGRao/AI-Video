import { generateAIText } from "@/lib/ai/generate";
import { parseJsonFromText } from "@/lib/ai/parse-json";
import {
  aiTimelinePlanSchema,
  type AiTimelinePlan,
} from "@/lib/timeline/ai-schema";
import type { TimelineGenerationContext } from "@/lib/timeline/gather-context";
import {
  normalizeScenePlan,
  planFromSentences,
} from "@/lib/timeline/sentence-scenes";
import { buildTimelineFromPlan } from "@/lib/timeline/build-from-plan";
import type { TimelineDocument } from "@/lib/timeline/types";

function buildPrompt(ctx: TimelineGenerationContext): string {
  const mediaList = ctx.media
    .map(
      (m) =>
        `- id: ${m.id} | type: ${m.type} | file: ${m.originalName} | tags: ${m.tags.slice(0, 12).join(", ") || "none"}`
    )
    .join("\n");

  const sentenceBlock =
    ctx.sentences.length > 0
      ? ctx.sentences
          .slice(0, 24)
          .map(
            (s) =>
              `[${(s.startMs / 1000).toFixed(1)}s–${(s.endMs / 1000).toFixed(1)}s] ${s.text}`
          )
          .join("\n")
      : "(No sentence timestamps — divide timeline evenly across scenes)";

  const cueBlock =
    ctx.subtitleCues.length > 0
      ? ctx.subtitleCues
          .slice(0, 20)
          .map(
            (c) =>
              `[${(c.startMs / 1000).toFixed(1)}s] ${c.text.slice(0, 100)}`
          )
          .join("\n")
      : "(No subtitles yet)";

  return `You are an expert real-estate video editor for Indian property reels (9:16 vertical).

Create a scene timeline that matches the voiceover narration. Each scene uses ONE media asset id from the list.
Scenes must cover 0 to ${ctx.durationMs}ms with no gaps > 800ms. Prefer aligning scene cuts to sentence timestamps.

RULES:
- Use ONLY media ids from MEDIA ASSETS
- startMs/endMs are integers in milliseconds
- Minimum scene length 2500ms unless the full video is shorter
- Match media tags to narration (e.g. plantation photo when script mentions trees)
- Reuse the same media id if needed; prefer variety when tags fit
- Optional textOverlays: short CTA or price callouts (max 3), Kannada/English mix OK
- transitionOut on scenes except the last: usually "fade"

Respond with JSON only:
{
  "scenes": [
    {
      "mediaAssetId": "exact id from list",
      "startMs": 0,
      "endMs": 8000,
      "narrationSegment": "brief phrase this scene illustrates",
      "transitionOut": "fade"
    }
  ],
  "textOverlays": [
    { "text": "Site visit today", "startMs": 2000, "endMs": 6000 }
  ]
}

TOTAL DURATION MS: ${ctx.durationMs}

PROPERTY SUMMARY:
${ctx.propertySummary.slice(0, 1200)}

ACTIVE SCRIPT:
"""
${ctx.scriptExcerpt.slice(0, 3500)}
"""

VOICEOVER SENTENCES (align scene boundaries to these when possible):
${sentenceBlock}

SUBTITLE CUES:
${cueBlock}

MEDIA ASSETS:
${mediaList}`;
}

export async function generateAiTimelinePlan(
  ctx: TimelineGenerationContext
): Promise<{ plan: AiTimelinePlan; source: "ai" | "heuristic" }> {
  try {
    const text = await generateAIText({
      label: "TIMELINE_AI",
      temperature: 0.4,
      prompt: buildPrompt(ctx),
    });

    const raw = parseJsonFromText(text, aiTimelinePlanSchema);
    const plan = normalizeScenePlan(raw, ctx.durationMs, ctx.media);
    if (plan.scenes.length > 0) {
      return { plan, source: "ai" };
    }
  } catch {
    /* fall through */
  }

  const plan = planFromSentences(
    ctx.sentences,
    ctx.media,
    ctx.durationMs
  );
  return { plan, source: "heuristic" };
}

export async function generateAiTimelineDocument(
  ctx: TimelineGenerationContext
): Promise<{
  document: TimelineDocument;
  plan: AiTimelinePlan;
  source: "ai" | "heuristic";
}> {
  const { plan, source } = await generateAiTimelinePlan(ctx);
  const document = buildTimelineFromPlan(plan, ctx);
  return { document, plan, source };
}
