import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { defaultModel } from "@/lib/ai/client";
import { generateObject } from "ai";
import { z } from "zod";
import { parseCuesJson } from "@/lib/subtitles/cues";

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
${originalCues.map((c) => `[ID: ${c.id}] ${c.text}`).join("\n")}`;

    const { object } = await generateObject({
      model: defaultModel,
      schema: z.object({
        facts: z.array(
          z.object({
            text: z.string().describe("Short overlay text (max 3 words)"),
            category: z.string().describe("Category like Price, Acreage, Location, Amenities, etc."),
            cueId: z.string().describe("The exact ID of the cue where this is spoken"),
          })
        ),
      }),
      prompt,
    });

    // Map the returned cue IDs to actual timings
    const timedFacts = object.facts.map((fact, index) => {
      const cue = originalCues.find((c) => c.id === fact.cueId);
      const startMs = cue ? cue.startMs : 0;
      // Find sentence end or default to 3 seconds display
      const endMs = cue ? Math.max(cue.endMs + 1500, startMs + 2500) : 3000;
      
      return {
        id: `fact-${index}-${Math.random().toString(36).slice(2, 6)}`,
        text: fact.text,
        category: fact.category,
        startMs,
        endMs,
      };
    });

    // Sort by startMs
    timedFacts.sort((a, b) => a.startMs - b.startMs);

    // Prevent facts from overlapping in time entirely
    for (let i = 0; i < timedFacts.length; i++) {
      if (i > 0) {
        if (timedFacts[i].startMs < timedFacts[i - 1].endMs) {
          const duration = timedFacts[i].endMs - timedFacts[i].startMs;
          timedFacts[i].startMs = timedFacts[i - 1].endMs;
          timedFacts[i].endMs = timedFacts[i].startMs + duration;
        }
      }
    }

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
