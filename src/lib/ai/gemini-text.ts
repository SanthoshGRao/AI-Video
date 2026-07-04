/**
 * Plain-text generation via the Google Gemini REST API.
 *
 * Gemini is markedly stronger than GPT-4o at Indic scripts (Kannada/Hindi),
 * so it is the preferred writer for code-mixed "Kanglish" voiceover scripts.
 * Uses the same GOOGLE_AI_API_KEY + generateContent pattern as the TTS code,
 * so no extra SDK dependency is required.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Fast, high-quality multilingual model. Overridable via env for easy upgrades. */
export const GEMINI_TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.5-flash";

function getGoogleApiKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_CLOUD_API_KEY;
  if (!key?.trim()) throw new Error("Google AI API key not configured.");
  return key.trim();
}

export function hasGeminiTextConfigured(): boolean {
  return !!(
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_CLOUD_API_KEY?.trim()
  );
}

export async function generateGeminiText(options: {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
}): Promise<string> {
  const apiKey = getGoogleApiKey();
  const model = options.model ?? GEMINI_TEXT_MODEL;
  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    contents: [{ parts: [{ text: options.prompt }], role: "user" }],
    generationConfig: {
      temperature: options.temperature ?? 0.9,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    ],
  };
  if (options.system) {
    body.systemInstruction = { parts: [{ text: options.system }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = `Gemini text API error: ${res.status}`;
    try {
      const json = await res.json();
      if (json.error?.message) msg += ` - ${json.error.message}`;
    } catch {
      /* ignore parse failure */
    }
    throw new Error(msg);
  }

  const json = await res.json();
  const text: string =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text)
      .filter(Boolean)
      .join("") ?? "";

  if (!text.trim()) {
    throw new Error("Gemini returned empty text.");
  }
  return text.trim();
}
