import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { generateText } from "ai";
import { defaultModel } from "@/lib/ai/client";
import { generateGeminiText, hasGeminiTextConfigured } from "@/lib/ai/gemini-text";
import { requireProjectAccess, requireScriptInProject } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { refineScriptBodySchema } from "@/lib/validations/upload";
import { REFINE_LANGUAGE_INSTRUCTIONS as LANGUAGE_INSTRUCTIONS } from "@/lib/scripts/language-instructions";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    const body = refineScriptBodySchema.parse(await request.json());
    const { scriptVersionId, instruction } = body;

    const script = await requireScriptInProject(scriptVersionId, id, user.id);

    const project = await prisma.project.findUnique({
      where: { id },
      select: { language: true, durationSeconds: true },
    });
    const langInstruction =
      LANGUAGE_INSTRUCTIONS[project?.language || "english"];
      
    const targetWordCount = Math.round((project?.durationSeconds || 30) * 2.5);
    const minWordCount = Math.max(targetWordCount - 15, 0);

    const refinePrompt = `Refine this real estate video voiceover script based on the user's instruction.
Language guidelines to enforce:
${langInstruction}

CRITICAL TTS-READY FORMATTING RULES:
1. OUTPUT ONLY THE REVISED SPOKEN SCRIPT TEXT.
2. Absolutely NO stage directions, NO bracketed cues (like [Video], [Music], [Audio], [Background]), NO sound effects (SFX) notes.
3. Absolutely NO markdown formatting of any kind: NO bold (**text**), NO italics (*text*), NO headers (# text), NO bullet points, NO lists, NO dash signs. Just raw paragraphs.
4. DECIMAL FORMATTING: If the script contains any decimals (like "1.22 acre" or "6.5 lakhs"), they MUST be written in words (e.g. "1 point 22 acre", "65 lakhs", "6 point 5 lakhs") so the Text-To-Speech engine pronounces them correctly. Do NOT use dot notation (like "1.22").
5. Do NOT include any introductory or concluding conversational chat from the AI (like "Here is your refined script:"). Output only the raw spoken script content.
6. TARGET LENGTH: The script must be approximately ${targetWordCount} words to match the ${project?.durationSeconds || 30} seconds target duration. Do NOT generate less than ${minWordCount} words unless explicitly asked to shorten the script.

ORIGINAL SCRIPT:
"""
${script.content}
"""

USER INSTRUCTION:
${instruction}

OUTPUT ONLY THE REVISED SCRIPT.`;

    // Prefer Gemini; fall back to GPT-4o if Gemini fails.
    let text: string;
    if (hasGeminiTextConfigured()) {
      try {
        text = await generateGeminiText({ prompt: refinePrompt, temperature: 0.8 });
      } catch (err) {
        console.warn(
          `[REFINE_SCRIPT] Gemini failed, attempting GPT-4o fallback:`,
          err instanceof Error ? err.message : String(err)
        );
        ({ text } = await generateText({ model: defaultModel, prompt: refinePrompt }));
      }
    } else {
      ({ text } = await generateText({ model: defaultModel, prompt: refinePrompt }));
    }

    const updated = await prisma.scriptVersion.update({
      where: { id: scriptVersionId },
      data: {
        content: text.trim(),
        wordCount: text.trim().split(/\s+/).length,
        estimatedDuration: Math.round(text.trim().split(/\s+/).length / 2.5),
      },
    });

    return NextResponse.json({ script: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
