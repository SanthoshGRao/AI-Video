import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { generateText } from "ai";
import { defaultModel } from "@/lib/ai/client";
import { generateGeminiText, hasGeminiTextConfigured } from "@/lib/ai/gemini-text";
import { extractFactsFromText } from "@/lib/ai/extract-facts";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { generateScriptBodySchema } from "@/lib/validations/upload";
import { trackEvent } from "@/lib/analytics/track";
import { getNextScriptBatchMeta, VARIATIONS } from "@/lib/scripts/versioning";
import {
  canGenerateScripts,
  createEnvelopeFromExtracted,
  parseEnvelope,
} from "@/lib/facts/envelope";
import { factSchema } from "@/lib/ai/extract-facts";
import { GENERATE_LANGUAGE_INSTRUCTIONS as LANGUAGE_INSTRUCTIONS } from "@/lib/scripts/language-instructions";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    let body = {};
    try {
      const raw = await request.json();
      body = generateScriptBodySchema.parse(raw);
    } catch {
      body = {};
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: { template: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const propertyData = project.propertyData as { rawText?: string } | null;
    const rawText = propertyData?.rawText?.trim() ?? "";

    let factsToUse: Record<string, unknown> | null = null;
    let envelope = parseEnvelope(project.validatedFacts);

    if (!project.extractedFacts) {
      if (!rawText) {
        throw badRequest("Add property details before generating scripts.");
      }
      const extracted = await extractFactsFromText(
        rawText,
        project.template?.aiSystemPrompt
      );
      await prisma.project.update({
        where: { id },
        data: {
          extractedFacts: extracted as object,
          validatedFacts: Prisma.DbNull,
          status: "CONTENT_READY",
        },
      });
      throw badRequest(
        "Facts extracted. You can generate scripts from the Scripts tab."
      );
    }

    if (!envelope && rawText) {
      envelope = createEnvelopeFromExtracted(
        factSchema.parse(project.extractedFacts),
        rawText
      );
    }

    if (!canGenerateScripts(envelope, !!project.extractedFacts)) {
      throw badRequest("Extract property facts before generating scripts.");
    }

    factsToUse = envelope!.data as Record<string, unknown>;

    const templatePrompt =
      project.template?.aiSystemPrompt || "General real estate property.";
    const scriptStrategy =
      project.template?.scriptStrategy || "Engaging and professional layout.";

    const { nextBatch, startVersion } = await getNextScriptBatchMeta(project.id);

    const generatedScripts = await Promise.all(
      VARIATIONS.map(async (v, index) => {
        const targetWordCount = Math.round((project.durationSeconds || 30) * 2.5);
        const minWordCount = Math.max(targetWordCount - 15, 0);

        const prompt = `
You are the most-followed real estate reel voice in Karnataka. People follow you because you sound like a REAL person talking to a friend — never like an ad or a brochure. Your scripts feel spoken, warm, and human.

━━━ ASSIGNMENT ━━━
Write ONE voiceover script in the "${v.style}" style for a ${project.durationSeconds}-second property video.
Aim for around ${targetWordCount} words. Use that length to fit in ALL the important facts naturally — don't pad with empty adjectives, but don't cut real details short either. Cover everything the buyer needs to know while still sounding human.

━━━ VOICE & FEEL ━━━
Tone: ${project.tone}
Target audience: ${project.targetAudience || "General buyers"}
CTA style: ${project.ctaStyle}
Variation angle: ${v.angle}
Make THIS variation genuinely distinct — its own opening, its own emotional angle, its own flow. Do not reshuffle the same sentences the other variations would use.

━━━ LANGUAGE RULES ━━━
${LANGUAGE_INSTRUCTIONS[project.language] || LANGUAGE_INSTRUCTIONS.english}

━━━ CONTENT STRATEGY ━━━
Template context: ${templatePrompt}
Script strategy: ${scriptStrategy}

Use these verified property facts — do NOT add or invent facts, and do NOT leave important ones out. Work ALL of them in naturally:
${JSON.stringify(factsToUse, null, 2)}

To sound natural (while still covering everything):
- Follow the four structural beats in the language rules above — greeting/question, location, what you get and why, then legal/price/CTA
- Say WHY something matters in a human aside, not as a selling-point label
- Vary sentence length; talk TO the listener; let it breathe
- Fit every important detail in before the CTA — naturalness is about HOW you say them, not about dropping them

━━━ OUTPUT FORMAT RULES (STRICT) ━━━
1. Output ONLY the spoken script — no titles, no headers, no "Here is your script:"
2. NO stage directions, NO bracketed cues [Video], [Music], [SFX]
3. NO markdown: no bold, no italics, no bullet points, no dashes
4. NO emojis — they break TTS
5. Decimals: ALWAYS expand — "1.22" → "1 point 22", never use a dot
6. Just raw flowing paragraphs, exactly as someone would speak it
`;

        // Prefer Gemini for script writing; fall back to GPT-4o if Gemini fails.
        let text: string;
        if (hasGeminiTextConfigured()) {
          try {
            text = await generateGeminiText({ prompt, temperature: 0.9 });
          } catch (err) {
            console.warn(
              `[GENERATE_SCRIPT] Gemini failed, attempting GPT-4o fallback:`,
              err instanceof Error ? err.message : String(err)
            );
            ({ text } = await generateText({ model: defaultModel, prompt }));
          }
        } else {
          ({ text } = await generateText({ model: defaultModel, prompt }));
        }

        const trimmed = text.trim();
        const wordCount = trimmed.split(/\s+/).length;

        return {
          projectId: project.id,
          generationBatch: nextBatch,
          versionNumber: startVersion + index + 1,
          variationStyle: v.style,
          content: trimmed,
          language: project.language,
          wordCount,
          estimatedDuration: Math.round(wordCount / 2.5),
          isActive: true,
          isApproved: false,
        };
      })
    );

    const savedScripts = await prisma.$transaction(async (tx) => {
      await tx.scriptVersion.updateMany({
        where: { projectId: project.id },
        data: { isActive: false },
      });

      await tx.scriptVersion.createMany({ data: generatedScripts });

      return tx.scriptVersion.findMany({
        where: { projectId: project.id, generationBatch: nextBatch },
        orderBy: { versionNumber: "asc" },
      });
    });

    await trackEvent(user.id, "scripts_generated", {
      projectId: project.id,
      generationBatch: nextBatch,
      count: savedScripts.length,
    });

    return NextResponse.json({
      scripts: savedScripts,
      generationBatch: nextBatch,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
