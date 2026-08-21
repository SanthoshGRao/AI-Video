import { synthesizeEdgeSpeech } from "@/lib/tts/edge-tts";
import { synthesizeGoogleSpeech } from "@/lib/tts/google-cloud-tts";
import type { VoicePersonaConfig } from "@/lib/tts/voices";

export type TtsProvider = "google" | "edge";

export function hasGoogleTtsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_CLOUD_API_KEY?.trim()
  );
}

/**
 * Prefer Google Gemini TTS when configured; fall back to Edge TTS (free).
 */
export async function synthesizeSpeech(options: {
  text: string;
  voice: VoicePersonaConfig;
}): Promise<{ buffer: Buffer; provider: TtsProvider }> {
  if (hasGoogleTtsConfigured()) {
    try {
      const buffer = await synthesizeGoogleSpeech(options);
      return { buffer, provider: "google" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[TTS] Google Gemini failed, trying Edge:", msg);
    }
  }

  const buffer = await synthesizeEdgeSpeech(options);
  return { buffer, provider: "edge" };
}
