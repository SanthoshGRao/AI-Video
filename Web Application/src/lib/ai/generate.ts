/**
 * One place that decides which model actually answers a prompt.
 *
 * Gemini first, GPT-4o as the fallback. That order matters for more than
 * quality: the desktop app ships with a Google key baked in, but has no
 * OpenAI key unless the user supplies one or is signed in for a relay token.
 * When neither exists, src/lib/ai/client.ts hands OpenAI the literal string
 * "mock-key-for-build" and every call comes back 401 — surfacing to the user
 * as a bare "Internal server error".
 *
 * Each call site used to hand-roll this try/catch, so any route that forgot
 * was quietly OpenAI-only and broken on a default install. Route new AI calls
 * through here instead of importing the OpenAI models directly.
 */

import { generateText } from "ai";
import { defaultModel, visionModel } from "@/lib/ai/client";
import { generateGeminiText, hasGeminiTextConfigured } from "@/lib/ai/gemini-text";

export interface GenerateOptions {
  prompt: string;
  system?: string;
  temperature?: number;
  /** Label used in the warning logged when Gemini fails. */
  label?: string;
}

/** Plain-text generation. Gemini, falling back to GPT-4o. */
export async function generateAIText(options: GenerateOptions): Promise<string> {
  const { prompt, system, temperature, label = "AI" } = options;

  if (hasGeminiTextConfigured()) {
    try {
      return await generateGeminiText({ prompt, system, temperature });
    } catch (err) {
      console.warn(
        `[${label}] Gemini failed, attempting GPT-4o fallback:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const { text } = await generateText({
    model: defaultModel,
    ...(system ? { system } : {}),
    prompt,
  });
  return text;
}

/** Image analysis. Gemini's multimodal endpoint, falling back to GPT-4o vision. */
export async function generateAIVision(
  options: GenerateOptions & { image: Buffer; mimeType: string }
): Promise<string> {
  const { prompt, temperature, image, mimeType, label = "AI" } = options;

  if (hasGeminiTextConfigured()) {
    try {
      return await generateGeminiText({
        prompt,
        temperature,
        image: { data: image, mimeType },
      });
    } catch (err) {
      console.warn(
        `[${label}] Gemini vision failed, attempting GPT-4o fallback:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const { text } = await generateText({
    model: visionModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image",
            image,
            mediaType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
          },
        ],
      },
    ],
  });
  return text;
}
