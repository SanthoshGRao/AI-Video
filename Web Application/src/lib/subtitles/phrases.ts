import type { SubtitlePhrase } from "@/lib/tts/types";

const PROPERTY_FEATURE_PATTERNS = [
  /\bDC\s+Converted\b/i,
  /\bE[-\s]?Khata(?:\s+Available)?\b/i,
  /\bRERA(?:\s+Approved)?(?:\s+Layout)?\b/i,
  /\bRing\s+Road\b/i,
  /\bVilla\s+Plot\b/i,
  /\bInvestment\s+Property\b/i,
  /\b(?:Mysore|Bangalore|Highway)\b/i,
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitLongPhrase(text: string): string[] {
  const words = normalizeWhitespace(text).split(" ").filter(Boolean);
  if (words.length <= 7) return [normalizeWhitespace(text)];

  const chunks: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    const currentText = current.join(" ");
    const hasFeature = PROPERTY_FEATURE_PATTERNS.some((pattern) => pattern.test(currentText));
    if (current.length >= 6 || (hasFeature && current.length >= 3)) {
      chunks.push(currentText);
      current = [];
    }
  }

  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
}

export function splitAuthoredSubtitlePhrases(scriptText: string): SubtitlePhrase[] {
  const normalized = normalizeWhitespace(scriptText);
  if (!normalized) return [];

  const initial = normalized
    .split(/(?<=[.!?।॥])\s+|\s*[,;:]\s+|\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean);

  const phrases = initial.flatMap(splitLongPhrase);

  return phrases.map((display, index) => ({
    id: `phrase-${index}`,
    display,
  }));
}
