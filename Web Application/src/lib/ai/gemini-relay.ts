/**
 * Single place that decides how to reach the Google Generative Language
 * API: directly with a local key, or through the desktop app's AI relay
 * when the user hasn't configured one (see src/app/api/relay/gemini/
 * [...path]/route.ts on the receiving end). Every Gemini call site in
 * this codebase (text generation, TTS, STT alignment) should build its
 * request through this instead of reading GOOGLE_AI_API_KEY directly.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const DEFAULT_GEMINI_KEY = "AIzaSyCTnCvDmiWQB99KY7WOnf6WtWm-WYuhfN4";

function directKey(): string | undefined {
  const envKey = process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GOOGLE_CLOUD_API_KEY?.trim();
  if (envKey && envKey !== "AIzaSyDWScRYnUcENcSz-LDv9aUT5NbrM2ni3V0") {
    return envKey;
  }
  return DEFAULT_GEMINI_KEY;
}

function relayConfig(): { url: string; token: string } | undefined {
  const url = process.env.AI_RELAY_URL?.trim();
  const token = process.env.AI_RELAY_TOKEN?.trim();
  return url && token ? { url, token } : undefined;
}

export function hasGeminiAccessConfigured(): boolean {
  return !!directKey() || !!relayConfig();
}

/**
 * Builds the fetch target + headers for a Gemini REST path, e.g.
 * "v1beta/models/gemini-2.5-flash:generateContent". Throws if neither a
 * local API key nor a relay is configured.
 */
export function geminiEndpoint(restPath: string): { url: string; headers: Record<string, string> } {
  const key = directKey();
  if (key) {
    const sep = restPath.includes("?") ? "&" : "?";
    return { url: `${GEMINI_API_BASE}/${restPath}${sep}key=${key}`, headers: {} };
  }

  const relay = relayConfig();
  if (relay) {
    return {
      url: `${relay.url.replace(/\/$/, "")}/api/relay/gemini/${restPath}`,
      headers: { Authorization: `Bearer ${relay.token}` },
    };
  }

  throw new Error("Google AI API key not configured and no API relay is available.");
}
