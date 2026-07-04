import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { generateText } from "ai";
import { defaultModel } from "@/lib/ai/client";
import { generateGeminiText, hasGeminiTextConfigured } from "@/lib/ai/gemini-text";
import { requireProjectAccess, requireScriptInProject } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { refineScriptBodySchema } from "@/lib/validations/upload";

type RouteContext = { params: Promise<{ id: string }> };

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  english: `Keep the script entirely in English.
Strict TTS-ready rules:
- Format all decimal numbers by writing them out with 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Ensure the script is natural, conversational, and direct.`,

  kannada: `Keep the script entirely in Kannada (ಕನ್ನಡ) — no English words except unavoidable proper nouns.
Strict TTS-ready rules:
- Format all decimal numbers by writing them out using the English word 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Write other numbers in digits.`,

  kannada_english: `Keep the script in a natural, highly engaging conversational hybrid mix of Kannada (ಕನ್ನಡ) and English (commonly known as Kanglish), roughly 50/50 mix.

Style Guidelines:
- Decimals: Format all decimal numbers by writing them out with the English word 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Numbers/Quantities: Use English digits for measurements, sizes, prices, distances, and road widths (e.g. "30 feet road", "65 lakhs", "25 ಕಿಲೋಮೀಟರ್", "42 ತೆಂಗಿನ ಮರಗಳು").
- Technical/Legal property facts: Use English terms (e.g., "RTC available", "drip irrigation done", "borewell", "electricity available", "legal clarity", "smooth entry").
- Sentence Flow: Connect facts with natural conversational Kannada verbs and particles (e.g. "ಇದೆ", "ಕೇವಲ", "ಮಾಡಿ", "ಬಂದಿದೆ").
- Sentence Structure: Do NOT generate full English sentences. The overall sentence structure must be Kannada-driven, ending in Kannada verbs/particles (e.g. "ಇದೆ", "ಕೇವಲ", "ಮಾಡಿ", "ಬಂದಿದೆ"). Only embed English nouns, adjectives, or short phrases (like "entry smooth", "drip irrigation done", "maintenance easy", "water already sorted", "price per acre", "RTC available") inside the Kannada flow.
- Call to Action: Use a hybrid phrasing like "ಸೈಟ್ ವಿಸಿಟ್ ಗೇ WhatsApp ನಲ್ಲಿ D M ಮಾಡಿ" (Note: write "D M" with a space between D and M).`,

  hindi_english: `Keep the script in a natural, highly engaging conversational hybrid mix of Hindi (हिन्दी) and English (commonly known as Hinglish), roughly 50/50 mix.

Style Guidelines:
- Decimals: Format all decimal numbers by writing them out with the English word 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Numbers/Quantities: Use English digits for measurements, sizes, prices, distances, and road widths (e.g. "30 feet road", "65 lakhs", "25 किलोमीटर", "42 नारियल के पेड़").
- Technical/Legal property facts: Use English terms (e.g., "RTC available", "drip irrigation done", "borewell", "electricity available", "legal clarity", "smooth entry").
- Sentence Flow: Connect facts with natural conversational Hindi verbs and particles.
- Sentence Structure: Do NOT generate full English sentences. The overall sentence structure must be Hindi-driven, ending in Hindi verbs/particles. Only embed English nouns, adjectives, or short phrases inside the Hindi flow.
- Call to Action: Use a hybrid phrasing like "साइट विजिट के लिए WhatsApp पर D M करें".`,
};

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

    // Prefer Gemini (stronger at Kannada/Hindi code-mix); fall back to GPT-4o.
    let text: string;
    if (hasGeminiTextConfigured()) {
      try {
        text = await generateGeminiText({ prompt: refinePrompt, temperature: 0.8 });
      } catch (err) {
        console.warn(
          `[REFINE_SCRIPT] Gemini failed, falling back to GPT-4o:`,
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
