import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { defaultModel } from "@/lib/ai/client";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { parseCuesJson } from "@/lib/subtitles/cues";
import { layoutFactTimings } from "@/lib/facts/overlay-timing";
import { generateGeminiText, hasGeminiTextConfigured } from "@/lib/ai/gemini-text";
import { parseJsonFromText } from "@/lib/ai/parse-json";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const body = await request.json();
    const { trackId } = body;

    if (!trackId) {
      throw badRequest("trackId is required");
    }

    const track = await prisma.subtitleTrack.findUnique({
      where: { id: trackId, projectId: id },
    });

    if (!track) {
      throw badRequest("Subtitle track not found");
    }

    const originalCues = parseCuesJson(track.cues);
    if (originalCues.length === 0) {
      throw badRequest("No cues to extract facts from");
    }

    const prompt = `You are a real estate AI assistant.
Extract the 5-8 most important real estate facts from the following subtitle cues (e.g. Price, Acreage, Distance, Amenities).
For each fact, return a short, punchy overlay text (max 3 words, e.g., "₹35 LAKHS", "3 BHK HOUSE", "10 MIN AWAY", "DTCP APPROVED").
Also, return the EXACT cue ID from the list below that corresponds to when this fact is first spoken. This is crucial for perfect video timing.

Cues:
${originalCues.map((c) => `[ID: ${c.id}] ${c.text}`).join("\n")}

Respond with JSON only:
{
  "facts": [
    { "text": "short text", "category": "category", "cueId": "cue_id" }
  ]
}`;

    const factSchema = z.object({
      facts: z.array(
        z.object({
          text: z.string().describe("Short overlay text (max 3 words)"),
          category: z.string().describe("Category like Price, Acreage, Location, Amenities, etc."),
          cueId: z.string().describe("The exact ID of the cue where this is spoken"),
        })
      ),
    });

    // Prefer GPT-4o; fall back to Gemini if GPT fails.
    let object: z.infer<typeof factSchema>;
    try {
      ({ object } = await generateObject({
        model: defaultModel,
        schema: factSchema,
        prompt,
      }));
    } catch (err) {
      console.warn(
        `[ALIGN_FACTS] GPT-4o failed, attempting Gemini fallback:`,
        err instanceof Error ? err.message : String(err)
      );
      if (hasGeminiTextConfigured()) {
        const text = await generateGeminiText({ prompt, temperature: 0.7 });
        object = parseJsonFromText(text, factSchema);
      } else {
        throw err;
      }
    }

    // Map the returned cue IDs to actual timings. A fact whose cue the model
    // hallucinated used to collapse to startMs 0 — several facts then stacked
    // at the top of the video and the old overlap-shift pushed everything out
    // of sync with the spoken line. Fall back to spreading unmatched facts
    // across the cue list instead, and drop nothing to 0 silently.
    const cueById = new Map(originalCues.map((c) => [c.id, c]));
    const rawFacts = object.facts.map((fact, index) => {
      const cue =
        cueById.get(fact.cueId) ??
        cueById.get(String(fact.cueId).trim()) ??
        originalCues[
          Math.min(
            originalCues.length - 1,
            Math.round((index / Math.max(object.facts.length, 1)) * originalCues.length),
          )
        ];

      return {
        id: `fact-${index}-${Math.random().toString(36).slice(2, 6)}`,
        text: fact.text,
        category: fact.category,
        startMs: cue.startMs,
        endMs: cue.endMs,
      };
    });

    // Voiceover length is the true end of the video; the last cue can stop
    // short of it. The final title has to run all the way out.
    const audio = await prisma.audioAsset.findFirst({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      select: { durationMs: true },
    });

    const timedFacts = layoutFactTimings(rawFacts, {
      totalDurationMs: audio?.durationMs ?? undefined,
    });

    // Save back to project's extractedFacts field
    await prisma.project.update({
      where: { id },
      data: {
        extractedFacts: timedFacts,
      },
    });

    return NextResponse.json({
      success: true,
      facts: timedFacts,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
