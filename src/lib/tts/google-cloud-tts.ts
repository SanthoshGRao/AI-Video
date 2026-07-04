import { badRequest } from "@/lib/api/errors";
import type { VoicePersonaConfig } from "@/lib/tts/voices";

/* ------------------------------------------------------------------ */
/*  Gemini TTS via generateContent (primary)                          */
/* ------------------------------------------------------------------ */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function getApiKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_CLOUD_API_KEY;
  if (!key?.trim()) {
    throw badRequest("Google AI API key not configured.");
  }
  return key.trim();
}

function getGeminiModel(): string {
  return "gemini-3.1-flash-tts-preview";
}

function parsePcmSampleRate(mimeType: string | undefined): number {
  const match = mimeType?.match(/(?:rate|sample_rate)=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

function wrapPcmAsWav(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function normalizeGeminiAudio(data: string, mimeType: string | undefined): Buffer {
  const buffer = Buffer.from(data, "base64");
  if (mimeType?.includes("mpeg") || mimeType?.includes("mp3")) {
    return buffer;
  }

  return wrapPcmAsWav(buffer, parsePcmSampleRate(mimeType));
}

function prepareMixedLanguageTtsText(text: string): string {
  return text
    .replace(/ಈದು/g, "ಇದು")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[•*_#`]/g, " ")
    .replace(/\s*\n\s*/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, ".")
    .trim();
}

async function sanitizeAndNormalizeTextForTTS(
  text: string,
  languageCode: string,
  apiKey: string
): Promise<string> {
  let targetInstructions = "";
  if (languageCode.startsWith("en-")) {
    targetInstructions = "Translate any non-English text (such as Kannada, Hindi, Tamil, Telugu script, etc.) into standard, natural English words. For example, 'ಮೈಸೂರಿನಿಂದ ಕೇವಲ 25 ಕಿಲೋಮೀಟರ್' should become 'just 25 kilometers from Mysore'.";
  } else {
    targetInstructions = `The target language is ${languageCode}. Clean up the text for TTS reading.
IMPORTANT: Do NOT force transliteration into the native script. Keep the natural mix of English words and native script exactly as it is in the input. 
IMPORTANT: KEEP ALL NUMBERS IN ENGLISH. Do NOT translate numbers into native language words. "30 kilometers" must stay as "30 kilometers", NOT be converted to native script numbers.
For example, '1 acre property ಮೈಸೂರಿಗೆ' should remain '1 acre property ಮೈಸೂರಿಗೆ'.
Clean unspoken symbols or unsafe punctuation. Ensure the text flows naturally.`;
  }

  const prompt = `You are a text-to-speech text normalization assistant.
Rewrite the following narration script to be perfectly readable by a TTS voice model configured for language "${languageCode}".
Follow these rules:
1. ${targetInstructions}
2. Replace currency symbols (like "₹" or "$") with their spoken names (e.g. "Rupees").
3. Remove all emojis, hashtags, and special punctuation that cannot be spoken.
4. KEEP ALL NUMBERS IN ENGLISH DIGITS OR ENGLISH WORDS. Do not translate numbers into native script.
5. Keep all existing spoken words, meaning, script, and flow exactly. Output ONLY the rewritten text. Do not include any explanations, markdown formatting, or notes.

Text:
${text}`;

  console.warn(`[TTS] Normalizing text for language ${languageCode}...`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }],
        role: "user"
      }],
      safetySettings: [
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      ]
    })
  });

  if (!res.ok) {
    console.warn(`[TTS] Normalization API failed: ${res.status}`);
    return text;
  }
  const json = await res.json();
  const normalized = json.candidates?.[0]?.content?.parts?.[0]?.text;
  console.warn(`[TTS] Normalized result: ${normalized?.substring(0, 100)}...`);
  return normalized?.trim() || text;
}

/**
 * Synthesize speech using Google Gemini TTS (generateContent with AUDIO modality).
 * Uses gemini-3.1-flash-tts-preview with inline style instructions.
 * 
 * The entire script is sent as ONE API call to ensure voice consistency
 * across all sentences. Style instructions are prepended to the text content
 * with a "#### TRANSCRIPT" delimiter (the model reads them as director's notes
 * but only speaks the text after the delimiter).
 */
async function synthesizeWithGemini(options: {
  text: string;
  voice: VoicePersonaConfig;
  speakingInstructions?: string;
  condensedSpeakingInstructions?: string;
}): Promise<{ buffer: Buffer; spokenText: string }> {
  const apiKey = getApiKey();
  const model = getGeminiModel();
  const voiceName = options.voice.geminiVoice ?? "Kore";

  console.log(`[TTS] Synthesizing with Gemini:`, {
    model,
    voiceName,
    geminiVoice: options.voice.geminiVoice,
    voiceLabel: options.voice.label,
    languageCode: options.voice.languageCode,
    textLength: options.text.length,
  });

  // Step 1: Pre-normalize text to native script for non-English languages
  let ttsText = prepareMixedLanguageTtsText(options.text);
  if (!options.voice.languageCode.startsWith("en-")) {
    const hasEnglish = /[a-zA-Z]{2,}/.test(ttsText);
    if (hasEnglish) {
      console.log(`[TTS] Pre-normalizing mixed-language text to ${options.voice.languageCode}...`);
      const normalized = prepareMixedLanguageTtsText(
        await sanitizeAndNormalizeTextForTTS(options.text, options.voice.languageCode, apiKey)
      );
      if (normalized.trim()) {
        ttsText = normalized;
        console.log(`[TTS] Pre-normalized text (${ttsText.length} chars): ${ttsText.substring(0, 100)}...`);
      }
    }
  }

  // Step 2: Build retry attempts using INLINE style instructions.
  // The gemini-3.1-flash-tts-preview model does NOT support systemInstruction.
  // Instead, style instructions are prepended to the text with a "#### TRANSCRIPT"
  // delimiter. The model reads the instructions as director's notes and only
  // vocalizes the text after the delimiter.
  //
  // Strategy:
  //   Attempt 1: inline FULL speaking instructions + #### TRANSCRIPT + script
  //   Attempt 2: inline CONDENSED speaking instructions + #### TRANSCRIPT + script
  //   Attempt 3: plain text only (no style guidance)
  const attempts: { label: string; inlineInstructions?: string }[] = [];

  if (options.speakingInstructions) {
    attempts.push({
      label: "inline style (full)",
      inlineInstructions: options.speakingInstructions,
    });
  }
  if (options.condensedSpeakingInstructions && options.condensedSpeakingInstructions !== options.speakingInstructions) {
    attempts.push({
      label: "inline style (condensed)",
      inlineInstructions: options.condensedSpeakingInstructions,
    });
  }
  // Last resort: plain text
  attempts.push({ label: "plain text only" });

  for (const attempt of attempts) {
    console.log(`[TTS] Attempting TTS (${attempt.label}, model: ${model}, ${ttsText.length} chars)`);

    // Build the text content:
    // If we have style instructions, prepend them before the script with a delimiter.
    // The TTS model reads the instructions as non-spoken direction and only speaks
    // the text after "#### TRANSCRIPT".
    const contentText = attempt.inlineInstructions
      ? `${attempt.inlineInstructions}\n\n#### TRANSCRIPT\n\n${ttsText}`
      : ttsText;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      contents: [{ parts: [{ text: contentText }], role: "user" }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
      safetySettings: [
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      ],
    };

    const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errorMsg = `Gemini TTS API error: ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error?.message) {
          errorMsg += ` - ${errJson.error.message}`;
        }
      } catch {
        errorMsg += ` - ${await res.text()}`;
      }
      console.warn(`[TTS] ${attempt.label} failed: ${errorMsg}`);
      // Try next attempt
      continue;
    }

    const json = await res.json();
    const candidates = json.candidates;

    if (!candidates?.[0]?.content?.parts) {
      const jsonStr = JSON.stringify(json);
      if (jsonStr.includes(`"finishReason":"OTHER"`)) {
        console.warn(`[TTS] Gemini returned OTHER (${attempt.label}), trying next attempt...`);
        continue;
      }
      console.warn(`[TTS] No audio content (${attempt.label}): ${jsonStr.substring(0, 200)}`);
      continue;
    }

    for (const part of candidates[0].content.parts) {
      if (part.inlineData?.mimeType?.startsWith("audio/")) {
        console.log(`[TTS] Success (${attempt.label})`);
        return {
          buffer: normalizeGeminiAudio(part.inlineData.data, part.inlineData.mimeType),
          spokenText: options.text,
        };
      }
    }

    console.warn(`[TTS] Response had no audio data (${attempt.label})`);
  }

  throw new Error(`Gemini TTS failed after all attempts. Text preview: ${ttsText.substring(0, 200)}`);
}

/* ------------------------------------------------------------------ */
/*  Cloud TTS v1 (legacy fallback)                                    */
/* ------------------------------------------------------------------ */

const CLOUD_TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

export async function synthesizeWithCloudTTS(options: {
  text: string;
  voice: VoicePersonaConfig;
}): Promise<Buffer> {
  const apiKey = getApiKey();
  const voiceName =
    options.voice.cloudVoiceName ??
    (options.voice.languageCode === "kn-IN"
      ? "kn-IN-Wavenet-A"
      : options.voice.languageCode === "hi-IN"
        ? "hi-IN-Wavenet-A"
        : "en-US-Wavenet-D");

  const body = {
    input: { text: options.text },
    voice: {
      languageCode: options.voice.languageCode,
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: "MP3",
      sampleRateHertz: 24000,
    },
  };

  const res = await fetch(`${CLOUD_TTS_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    audioContent?: string;
    error?: { message?: string };
  };

  if (!res.ok || !json.audioContent) {
    throw new Error(
      json.error?.message ?? `Cloud TTS failed (${res.status})`
    );
  }

  return Buffer.from(json.audioContent, "base64");
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export type SynthesizeOptions = {
  text: string;
  voice: VoicePersonaConfig;
  speakingInstructions?: string;
  condensedSpeakingInstructions?: string;
};

/**
 * Synthesize speech using Google Gemini TTS.
 */
export async function synthesizeGoogleSpeech(
  options: SynthesizeOptions
): Promise<Buffer> {
  // Try Gemini TTS exclusively since Cloud TTS is blocked on the project
  return (await synthesizeWithGemini(options)).buffer;
}

export async function synthesizeGoogleSpeechWithMetadata(
  options: SynthesizeOptions
): Promise<{ buffer: Buffer; spokenText: string }> {
  return await synthesizeWithGemini(options);
}
