import { generateText } from "ai";
import { z } from "zod";
import { defaultModel } from "@/lib/ai/client";
import { generateGeminiText, hasGeminiTextConfigured } from "@/lib/ai/gemini-text";
import { parseJsonFromText } from "@/lib/ai/parse-json";

export const factSchema = z.object({
  location: z.string().nullish(),
  plotSize: z.string().nullish(),
  price: z.string().nullish(),
  priceUnit: z.string().nullish(),
  roadAccess: z.string().nullish(),
  water: z.array(z.string()).default([]),
  electricity: z.boolean().nullish(),
  legal: z.array(z.string()).default([]),
  plantation: z
    .array(z.object({ type: z.string(), count: z.number().nullish() }))
    .default([]),
  irrigation: z.string().nullish(),
  propertyType: z.string().nullish(),
  distances: z
    .array(z.object({ place: z.string(), km: z.number().nullish() }))
    .default([]),
  nearbyLandmarks: z.array(z.string()).default([]),
  additionalFeatures: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
});

export type ExtractedFactsResult = z.infer<typeof factSchema>;

export async function extractFactsFromText(
  rawText: string,
  templatePrompt?: string | null
): Promise<ExtractedFactsResult> {
  const ctx = templatePrompt || "General real estate property.";

  const prompt = `You are an expert Indian real estate data extractor (farmland, plantations, layouts).
Template Context: ${ctx}

Extract structured facts from the raw property description below.
These facts will be displayed as SHORT TITLE OVERLAYS on Instagram-style video reels.

IMPORTANT RULES:
- Keep all values SHORT and PUNCHY — suitable for video title overlays (2-5 words max per value).
- Use null for missing scalar fields. Use empty arrays when none apply. Do not invent data.
- For "location": Use the specific area/village name (e.g. "Near Pandavapura", "Nanjangud Taluk").
- For "plotSize": Include unit (e.g. "4.22 Acres", "1 Acre", "30x40 Ft").
- For "price": Include ₹ symbol and unit (e.g. "₹60 Lakhs/Acre", "₹25 Lakhs Total").
- For "roadAccess": Specify width if mentioned (e.g. "32 Ft", "30 Ft Tar Road").
- For "water": Short sources (e.g. "Borewell", "Open Well", "Canal").
- For "legal": Short phrases (e.g. "Clear Title", "RTC Available", "Converted Land").
- For "highlights": 2-4 word selling points (e.g. "Village Attached", "Plain Level Land", "Single Owner", "Gated Community").
- For "distances": Only include major nearby cities/towns with km distance.
- For "propertyType": Short type (e.g. "Agricultural Land", "Farm Plot", "Residential Layout").

Respond with JSON only:
{
  "location": "string or null",
  "plotSize": "string or null",
  "price": "string or null",
  "priceUnit": "string or null",
  "roadAccess": "string or null",
  "water": ["Borewell"],
  "electricity": true or false or null,
  "legal": ["Clear Title", "RTC Available"],
  "plantation": [{"type": "coconut", "count": 42}],
  "irrigation": "string or null",
  "propertyType": "string or null",
  "distances": [{"place": "Mysore", "km": 25}],
  "nearbyLandmarks": [],
  "additionalFeatures": ["Compound Wall", "Farm House"],
  "highlights": ["Single Owner", "Village Attached"]
}

RAW DESCRIPTION:
"""
${rawText}
"""`;

  // Prefer Gemini, fall back to GPT-4o — the same order generate-script and
  // refine-script use. Fact extraction used to call GPT-4o directly, which
  // meant it was the one AI feature with no path that worked on the built-in
  // Google key: with no OpenAI key and no relay token, src/lib/ai/client.ts
  // hands OpenAI the literal string "mock-key-for-build", OpenAI answers 401,
  // and the route surfaces a bare "Internal server error".
  let text: string;
  if (hasGeminiTextConfigured()) {
    try {
      text = await generateGeminiText({ prompt, temperature: 0.2 });
    } catch (err) {
      console.warn(
        "[EXTRACT_FACTS] Gemini failed, attempting GPT-4o fallback:",
        err instanceof Error ? err.message : String(err)
      );
      ({ text } = await generateText({ model: defaultModel, prompt }));
    }
  } else {
    ({ text } = await generateText({ model: defaultModel, prompt }));
  }

  return parseJsonFromText(text, factSchema);
}
