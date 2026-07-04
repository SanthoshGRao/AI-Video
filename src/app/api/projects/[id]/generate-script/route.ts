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

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  english: `Write the script entirely in English.
Strict TTS-ready rules:
- Format all decimal numbers by writing them out with 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Ensure the script is natural, conversational, and direct.`,

  kannada: `Write the script entirely in Kannada (ಕನ್ನಡ) — no English words except unavoidable proper nouns.
Strict TTS-ready rules:
- Format all decimal numbers by writing them out using the English word 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Write other numbers in digits.`,

  kannada_english: `You are writing a Kanglish (Kannada + English) voiceover the way a real Karnataka agent actually TALKS to a friend on a call — relaxed, warm, human. NOT an ad read, NOT a brochure, NOT a fact-list.

══════════════════════════════════════
CORE GRAMMAR — the spoken skeleton is Kannada
══════════════════════════════════════
The sentence flows in natural spoken Kannada; English words are dropped in only for numbers, units, and technical/brand terms. The sentence ends on a Kannada verb/particle.
✅ "30 feet road access ಇದೆ", "ಮೈಸೂರಿನಿಂದ ಕೇವಲ 25 kilometers ಅಷ್ಟೇ"
❌ "The road access is excellent." ← full English sentence, WRONG
❌ "Good location ಇದೆ nice property ಇದೆ" ← vague filler, WRONG

══════════════════════════════════════
SOUND LIKE A REAL PERSON — do this
══════════════════════════════════════
- Use RICH, varied everyday Kannada (Mysuru/Bangalore spoken style). Vary your verb endings — do NOT end sentence after sentence with "ಇದೆ". Rotate ಇದೆ / ಇರುತ್ತೆ / ಸಿಗುತ್ತೆ / ಆಗುತ್ತೆ / ನೋಡಿ / ಅಂತೂ / ತಗೊಳ್ಳಿ and other natural spoken forms.
- Talk TO the listener. Slip in a small question or nudge: "ಗೊತ್ತಾ?", "ಒಂದ್ಸಲ ಯೋಚ್ನೆ ಮಾಡಿ", "ಅಲ್ವಾ?".
- Vary rhythm HARD: a punchy 2–3 word line, then a longer flowing one, then short again. Real speech is uneven.
- Open with the ONE thing that would actually hook THIS buyer (emotion/curiosity) — NOT with the plot size or a location fact.

══════════════════════════════════════
DON'T — these make it robotic
══════════════════════════════════════
- DON'T recite facts in a fixed order (size → distance → road → legal → amenities → price). Group them the way a person naturally would, and let each variation open and flow DIFFERENTLY.
- DON'T stack English marketing adjectives ("premium high-appreciation potential property"). Say it plainly.
- DON'T dump amenities as a bare spec-sheet list — but DO mention the notable ones; weave them into the flow (e.g. "clubhouse, swimming pool ಎಲ್ಲಾ ಇರೋದ್ರಿಂದ...") instead of a flat comma list.
- DON'T reuse the same connector ("ಕೂಡ ಇದೆ … ಜೊತೆಗೆ … ಕೂಡ ಇದೆ") over and over.

══════════════════════════════════════
COVER ALL THE IMPORTANT FACTS (a real agent leaves nothing key out)
══════════════════════════════════════
Include every important detail you're given — location & distances, size, price, legal status, road access, water/electricity, and the standout amenities/highlights. Do NOT drop details for the sake of brevity. The skill is fitting them ALL in while still sounding like natural speech, not a list. If you must choose what to lead with, lead with the hook — but still work the rest in before the CTA.

══════════════════════════════════════
STAYS IN ENGLISH (write in the LATIN alphabet — never spell in Kannada script, never translate)
══════════════════════════════════════
- Numbers & units: "30 feet", "65 lakhs", "25 kilometers", "2400 sq ft"
- Legal/technical/brand: RTC, E-Khata, DC Converted, RERA, borewell, drip irrigation, gated community
- Place names as people say them: Bangalore, Sarjapur, Electronic City, Mysore

CRITICAL — spelling English words in Kannada letters is the #1 thing that makes the voice sound robotic and misspelled. Keep them in English letters:
  ✅ "drip irrigation", "gated community", "RERA Approved", "2400 sq ft", "Electronic City", "78 lakhs"
  ❌ "ಡ್ರಿಪ್ ಇರಿಗೇಶನ್", "ಗೇಟೆಡ್ ಕಮ್ಯೂನಿಟಿ", "ಆರ್ ಈ ಆರ್ ಎ ಅಪ್ರೂವ್ಡ್", "ಸ್ಕ್ವೇರ್ ಫೀಟ್", "ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಸಿಟಿ", "ಲ್ಯಾಖ್ಸ್"
Only genuinely Kannada words go in Kannada script (ಇದೆ, ನೋಡಿ, ಗೊತ್ತಾ, ದೂರದಲ್ಲಿ, ಬಳಿ …).

══════════════════════════════════════
DECIMAL RULE (critical for TTS)
══════════════════════════════════════
NEVER write a decimal point. Always expand: "1.22 acres" → "1 point 22 acre", "6.5 lakhs" → "6 point 5 lakhs".

══════════════════════════════════════
CALL TO ACTION (fixed, end with exactly)
══════════════════════════════════════
"ಸೈಟ್ ವಿಸಿಟ್ ಗೇ WhatsApp ನಲ್ಲಿ D M ಮಾಡಿ"
(Write "D M" with a space between the letters — required for TTS)

══════════════════════════════════════
TONE REFERENCE (feel only — do NOT copy words or fact-order; use your own facts and a fresh structure each time)
══════════════════════════════════════
"ಈ ಸಿಟಿ ಗದ್ದಲ ಸಾಕಾಗಿದೆ ಅಲ್ವಾ? ಹಾಗಾದ್ರೆ ಇಲ್ಲಿ ನೋಡಿ. ಮೈಸೂರಿನಿಂದ ಕೇವಲ 25 kilometers, ಒಂದು 1 point 22 acre coconut land. ಗೊತ್ತಾ, ಇಲ್ಲಿ maintenance ಅಂತ ತಲೆಬಿಸಿನೇ ಇಲ್ಲ — drip irrigation ಆಗಲೇ done. Legal ಎಲ್ಲಾ full clear, RTC ಕೈಯಲ್ಲೇ ಇರುತ್ತೆ. ಬೆಲೆ? Per acre 65 lakhs ಅಷ್ಟೇ. ಇಂತಹ ಚಾನ್ಸ್ ಮತ್ತೆ ಸಿಗಲ್ಲ. ಸೈಟ್ ವಿಸಿಟ್ ಗೇ WhatsApp ನಲ್ಲಿ D M ಮಾಡಿ."`,

  hindi_english: `Write the script in a natural, highly engaging conversational hybrid mix of Hindi (हिन्दी) and English (commonly known as Hinglish), roughly 50/50 mix.

Style Guidelines:
- Decimals: Format all decimal numbers by writing them out with the English word 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Numbers/Quantities: Use English digits for measurements, sizes, prices, distances, and road widths (e.g. "30 feet road", "65 lakhs", "25 किलोमीटर", "42 नारियल के पेड़").
- Technical/Legal property facts: Use English terms (e.g., "RTC available", "drip irrigation done", "borewell", "electricity available", "legal clarity", "smooth entry").
- Sentence Flow: Connect facts with natural conversational Hindi verbs and particles.
- Sentence Structure: Do NOT generate full English sentences. The overall sentence structure must be Hindi-driven, ending in Hindi verbs/particles. Only embed English nouns, adjectives, or short phrases inside the Hindi flow.
- Call to Action: Use a hybrid phrasing like "साइट विजिट के लिए WhatsApp पर D M करें".`,
};

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
- Lead with the ONE thing that hooks this buyer, then talk around it — don't march through the facts in a fixed order
- Say WHY something matters in a human aside, not as a selling-point label
- Vary sentence length hard; talk TO the listener; let it breathe
- Fit every important detail in before the CTA — naturalness is about HOW you say them, not about dropping them

━━━ OUTPUT FORMAT RULES (STRICT) ━━━
1. Output ONLY the spoken script — no titles, no headers, no "Here is your script:"
2. NO stage directions, NO bracketed cues [Video], [Music], [SFX]
3. NO markdown: no bold, no italics, no bullet points, no dashes
4. NO emojis — they break TTS
5. Decimals: ALWAYS expand — "1.22" → "1 point 22", never use a dot
6. Just raw flowing paragraphs, exactly as someone would speak it
`;

        // Prefer Gemini for script writing — it is far stronger at Kannada /
        // Hindi script and code-mixed spelling than GPT-4o. Fall back to GPT-4o
        // only if Gemini is unavailable or errors, so generation never hard-fails.
        let text: string;
        if (hasGeminiTextConfigured()) {
          try {
            text = await generateGeminiText({ prompt, temperature: 0.9 });
          } catch (err) {
            console.warn(
              `[GENERATE_SCRIPT] Gemini failed, falling back to GPT-4o:`,
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
