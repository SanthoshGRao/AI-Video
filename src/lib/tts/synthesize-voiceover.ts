import { synthesizeGoogleSpeechWithMetadata } from "@/lib/tts/google-cloud-tts";
import { synthesizeEdgeSpeech } from "@/lib/tts/edge-tts";
import { alignWithGeminiStt } from "@/lib/tts/gemini-stt-align";
import { estimateMp3DurationMs } from "@/lib/tts/mp3-duration";
import { splitAuthoredSubtitlePhrases } from "@/lib/subtitles/phrases";
import {
  buildSentencesFromWords,
  type AudioSyncData,
  type SubtitlePhrase,
} from "@/lib/tts/types";
import { type VoicePersonaConfig, buildSpeakingInstructions, buildCondensedSpeakingInstructions } from "@/lib/tts/voices";

export type SynthesizeResult = {
  audioBuffer: Buffer;
  durationMs: number;
  sync: AudioSyncData;
  ttsProvider: "google" | "edge";
};

/**
 * Maximum text length we send to Gemini TTS in a single call.
 * The model supports ~160s of audio output. At ~15 chars/second average,
 * 5000 chars ≈ ~330 seconds which is generous. We truncate beyond this
 * to avoid timeouts on extremely long scripts.
 */
const MAX_TTS_TEXT_LENGTH = 5000;

function isWav(buffer: Buffer): boolean {
  return buffer.length >= 44 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
}

function getWavData(buffer: Buffer): Buffer | null {
  if (!isWav(buffer)) return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkId === "data") return buffer.subarray(dataStart, dataStart + chunkSize);
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return null;
}

function estimateWavDurationMs(buffer: Buffer): number {
  const data = getWavData(buffer);
  if (!data) return 0;
  const sampleRate = buffer.readUInt32LE(24);
  const byteRate = buffer.readUInt32LE(28);
  if (!sampleRate || !byteRate) return 0;
  return Math.round((data.length / byteRate) * 1000);
}

function estimateAudioDurationMs(buffer: Buffer): number {
  if (isWav(buffer)) return estimateWavDurationMs(buffer);
  return estimateMp3DurationMs(buffer);
}

function subtitlePhrasesFromGeminiSrt(
  anchors: { text: string; start: number; end: number }[],
  authoredPhrases: SubtitlePhrase[]
): SubtitlePhrase[] {
  return anchors.map((anchor, index) => ({
    id: authoredPhrases[index]?.id ?? `phrase-${index}`,
    display: anchor.text,
    spoken: authoredPhrases[index]?.spoken ?? anchor.text,
    start: anchor.start,
    end: anchor.end,
  }));
}

/* ------------------------------------------------------------------ */
/*  Phase 1: Text Normalization (Gemini Flash)                        */
/* ------------------------------------------------------------------ */

async function normalizeScriptWithGeminiFlash(scriptText: string, languageCode: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) throw new Error("Google AI API key not configured.");

  // If it's pure English, no intensive normalization needed, just minor cleanup
  if (languageCode.startsWith("en-")) {
    return scriptText.replace(/[""]/g, '"').replace(/['']/g, "'").replace(/[•*_#`]/g, " ").trim();
  }

  console.log(`[TTS_PHASE_1] Normalizing script for ${languageCode}...`);

  const systemInstruction = `You are a Text Normalizer for a professional ${languageCode} TTS engine.
The input is an INTENTIONALLY code-mixed (native script + English) voiceover script written by an expert. Your ONLY job is light cleanup so the voice reads it smoothly. Preserve the author's language mix EXACTLY.

RULES:
1. DO NOT TRANSLITERATE. Keep English words in the Latin alphabet exactly as written (e.g. "drip irrigation", "road access", "premium", "borewell"). Keep native-script words in native script. NEVER convert one script into the other — transliteration creates misspelled, unnatural, robotic-sounding words. This is the most important rule.
2. KEEP ALL NUMBERS AND MEASUREMENTS IN ENGLISH (e.g. "30 kilometers", "2.22 acres", "120 trees", "65 lakhs"). Never convert numbers into native words or native-script digits.
3. Remove only what a voice cannot speak: emojis, markdown symbols (* _ # \`), and stray bullets. Replace currency symbols with their spoken word ("₹" → "rupees").
4. Do NOT add, remove, translate, reword, or reorder anything. Keep the exact wording and order.
5. Output ONLY the cleaned string. No markdown, no explanations, no notes.

Example (kn-IN):
Input: "1 acre property ಮೈಸೂರಿಗೆ 30 kilometers 🌴"
Output: "1 acre property ಮೈಸೂರಿಗೆ 30 kilometers"
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: scriptText }], role: "user" }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
      })
    });

    if (!res.ok) {
      console.warn(`[TTS_PHASE_1] Normalization failed with status ${res.status}. Falling back to raw text.`);
      return scriptText;
    }

    const json = await res.json();
    const normalized = json.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (normalized) {
      console.log(`[TTS_PHASE_1] Success. Normalized text snippet: ${normalized.substring(0, 80)}...`);
      return normalized.trim();
    }
  } catch (error) {
    console.error(`[TTS_PHASE_1] Error during normalization:`, error);
  }

  return scriptText;
}

/* ------------------------------------------------------------------ */
/*  Phase 2: Audio Synthesis (Single API call for voice consistency)   */
/* ------------------------------------------------------------------ */

async function buildAudioSyncFast(
  audioBuffer: Buffer,
  authoredPhrases: SubtitlePhrase[] = []
): Promise<AudioSyncData> {
  const durationMs = estimateAudioDurationMs(audioBuffer) || 10000;
  const phraseDuration = durationMs / Math.max(1, authoredPhrases.length);
  
  const words: { word: string; start: number; end: number }[] = [];
  const phrases: { text: string; start: number; end: number; words: any[] }[] = [];
  
  for (let i = 0; i < authoredPhrases.length; i++) {
    const phrase = authoredPhrases[i];
    const startMs = i * phraseDuration;
    const endMs = startMs + phraseDuration;
    
    const textWords = phrase.display.split(/\s+/).filter(Boolean);
    const wordDuration = phraseDuration / Math.max(1, textWords.length);
    const phraseWords = [];
    
    for (let j = 0; j < textWords.length; j++) {
      const wStart = (startMs + j * wordDuration) / 1000;
      const wEnd = (startMs + (j + 1) * wordDuration) / 1000;
      const w = { word: textWords[j] || "", start: wStart, end: wEnd };
      words.push(w);
      phraseWords.push(w);
    }
    
    phrases.push({
      text: phrase.display,
      start: startMs / 1000,
      end: endMs / 1000,
      words: phraseWords
    });
  }

  const resultPhrases = authoredPhrases.map((phrase, index) => ({
    id: phrase.id,
    display: phrase.display,
    spoken: phrase.display,
    start: (index * phraseDuration) / 1000,
    end: ((index + 1) * phraseDuration) / 1000,
  }));

  return {
    version: 1,
    words,
    sentences: buildSentencesFromWords(words),
    phrases,
    authoredPhrases: resultPhrases,
    syncSource: "estimated",
  };
}

export async function synthesizeVoiceover(
  scriptText: string,
  voice: VoicePersonaConfig
): Promise<SynthesizeResult> {
  console.log(`[VOICEOVER_PIPELINE] Starting TTS Pipeline (single-call, consistent voice)`, {
    voiceLabel: voice.label,
    languageCode: voice.languageCode,
    provider: voice.provider,
    scriptLength: scriptText.length,
  });

  // 1. Phase 1: Normalize the script text using fast LLM
  const normalizedText = await normalizeScriptWithGeminiFlash(scriptText, voice.languageCode);

  // 2. Truncate if the text is too long (option A: truncate with warning)
  let textToSynthesize = normalizedText;
  if (textToSynthesize.length > MAX_TTS_TEXT_LENGTH) {
    console.warn(
      `[VOICEOVER_PIPELINE] Script is ${textToSynthesize.length} chars (max ${MAX_TTS_TEXT_LENGTH}). ` +
      `Truncating to fit TTS model limits.`
    );
    // Truncate at a sentence boundary if possible
    const truncated = textToSynthesize.substring(0, MAX_TTS_TEXT_LENGTH);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf(". "),
      truncated.lastIndexOf("! "),
      truncated.lastIndexOf("? "),
      truncated.lastIndexOf("।"), // Hindi/Kannada sentence ender
    );
    textToSynthesize = lastSentenceEnd > MAX_TTS_TEXT_LENGTH * 0.5
      ? truncated.substring(0, lastSentenceEnd + 1).trim()
      : truncated.trim();
  }

  // 3. Phase 2: Synthesize audio as a SINGLE API call for voice consistency
  //    No chunking — one call = one consistent voice across all sentences
  let audioBuffer: Buffer;
  let providerUsed: "google" | "edge";

  console.log(`[VOICEOVER_PIPELINE] Synthesizing audio via Gemini 3.1 Flash TTS (single call, ${textToSynthesize.length} chars)...`);
  try {
    const result = await synthesizeGoogleSpeechWithMetadata({ 
      text: textToSynthesize, 
      voice,
      speakingInstructions: buildSpeakingInstructions(voice),
      condensedSpeakingInstructions: buildCondensedSpeakingInstructions(voice),
    });
    audioBuffer = result.buffer;
    providerUsed = "google";
    console.log(`[VOICEOVER_PIPELINE] Audio successfully synthesized (${audioBuffer.length} bytes)`);
  } catch (error) {
    console.error(`[VOICEOVER_PIPELINE] Primary TTS provider (${voice.provider}) failed:`, error);
    throw new Error(`TTS synthesis failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const authoredPhrases = splitAuthoredSubtitlePhrases(scriptText);
  const phrasesToSync = authoredPhrases.length > 0 ? authoredPhrases : [{ id: "phrase-0", display: scriptText, spoken: scriptText }];

  console.log(`[VOICEOVER_PIPELINE] Running STT alignment...`);
  let sttResult = null;
  try {
    sttResult = await alignWithGeminiStt({
      audioBuffer,
      fileExtension: "wav",
      phraseCount: phrasesToSync.length,
      scriptText: scriptText,
      languageCode: voice.languageCode,
    });
  } catch (err) {
    console.warn("[VOICEOVER_PIPELINE] STT failed, falling back to fast sync:", err);
  }

  const sync: AudioSyncData = sttResult ? {
    version: 1,
    words: sttResult.words,
    sentences: buildSentencesFromWords(sttResult.words),
    phrases: sttResult.phrases,
    authoredPhrases: phrasesToSync,
    syncSource: "google-stt",
  } : await buildAudioSyncFast(audioBuffer, phrasesToSync);

  const actualDurationMs = estimateAudioDurationMs(audioBuffer);
  const durationMs = actualDurationMs > 0
    ? actualDurationMs
    : sync.words.length > 0
      ? Math.round(sync.words[sync.words.length - 1].end * 1000)
      : 10000;

  return { audioBuffer, durationMs, sync, ttsProvider: providerUsed };
}
