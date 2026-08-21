import { createHash } from "node:crypto";

/**
 * Shared by the live preview endpoint (src/app/api/tts/preview/route.ts) and
 * the offline cache-warming script (scripts/warm-tts-preview-cache.ts).
 * Keeping this in one place guarantees both compute the same cache key, so a
 * pre-warmed sample is always found instead of silently re-synthesizing.
 */
export const SAMPLE_TEXT_BY_LANGUAGE: Record<string, string> = {
  "kn-IN": "ನಮಸ್ಕಾರ, ಇದು ನಿಮ್ಮ voice preview. ಈ style ಹೇಗಿದೆ ಅಂತ ಕೇಳಿ ನೋಡಿ.",
  "hi-IN": "नमस्ते, यह आपकी आवाज़ का पूर्वावलोकन है। सुनिए यह स्टाइल कैसा लगता है।",
  "en-US": "Hi there, this is a quick preview of this voice and style. Let's see how it sounds for your video.",
  "en-GB": "Hello there, this is a quick preview of this voice and style. Let's see how it sounds for your video.",
  "en-IN": "Hello, this is a quick preview of this voice and style. Let's see how it sounds for your video.",
};

export function sampleTextFor(languageCode: string): string {
  return SAMPLE_TEXT_BY_LANGUAGE[languageCode] ?? SAMPLE_TEXT_BY_LANGUAGE["en-US"];
}

export function buildPreviewCacheKey(
  voiceName: string,
  languageCode: string,
  speakingInstructions: string
): string {
  return createHash("sha256")
    .update(`${voiceName}|${languageCode}|${speakingInstructions}`)
    .digest("hex");
}
