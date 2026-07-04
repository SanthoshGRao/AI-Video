import type { PhraseTimestamp, WordTimestamp } from "@/lib/tts/types";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function getApiKey(): string | null {
  return (process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_CLOUD_API_KEY)?.trim() || null;
}

function getSttModel(): string {
  return process.env.GOOGLE_STT_MODEL ?? "gemini-2.5-flash";
}

function formatMimeType(fileExtension: string): string {
  if (fileExtension === "wav") return "audio/wav";
  if (fileExtension === "mp3") return "audio/mpeg";
  return "audio/*";
}

function parseSrtTime(time: string): number {
  // Standard SRT: HH:MM:SS,mmm. Gemini might output MM:SS:mmm or HH:MM:SS:mmm
  const parts = time.trim().split(/[:,.]/);
  if (parts.length === 0) return 0;
  
  if (parts.length === 4) {
    // HH:MM:SS,mmm
    const [h, m, s, ms] = parts;
    return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
  } else if (parts.length === 3) {
    // Could be HH:MM:SS or MM:SS:mmm. If the last part has 3 digits, or if the first part is 0 and it's a short video, it's likely MM:SS:mmm.
    // Given the context of short real-estate videos, we assume MM:SS:mmm.
    const [m, s, ms] = parts;
    return Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
  }
  
  return 0;
}

function parseSrt(text: string): PhraseTimestamp[] {
  const normalized = text.replace(/```(?:srt)?/gi, "").replace(/```/g, "").trim();
  const phrases: PhraseTimestamp[] = [];

  // First try standard multi-line SRT parsing (blocks separated by blank lines)
  const blocks = normalized.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) continue;

    // Check if the timing line itself contains inline text after the end timestamp
    const arrowMatch = timingLine.match(/^(.+?)\s*-->\s*(\S+)\s*(.*)/);
    if (!arrowMatch) continue;

    const startRaw = arrowMatch[1].trim();
    const endRaw = arrowMatch[2].trim();
    const inlineText = arrowMatch[3]?.trim() || "";

    // Text lines after the timing line
    const textLines = lines.slice(lines.indexOf(timingLine) + 1);
    // Combine inline text with any text lines below
    const allText = [inlineText, ...textLines].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    const start = parseSrtTime(startRaw);
    const end = parseSrtTime(endRaw);
    if (allText && end > start) {
      phrases.push({ text: allText, start, end });
    }
  }

  // If standard parsing found results, return them
  if (phrases.length > 0) return phrases;

  // Fallback: try line-by-line parsing for single-line-per-cue format
  // e.g. "00:00:00,750 --> 00:00:02,300 ನಾಡಿನ ಸುಂದರ ಪ್ರದೇಶದ"
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^(.+?)\s*-->\s*(\S+)\s+(.*)/);
    if (!match) continue;
    const start = parseSrtTime(match[1].trim());
    const end = parseSrtTime(match[2].trim());
    const cueText = match[3].trim();
    if (cueText && end > start) {
      phrases.push({ text: cueText, start, end });
    }
  }

  return phrases;
}

function wordsFromPhrases(phrases: PhraseTimestamp[]): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  for (const phrase of phrases) {
    const tokens = phrase.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const slot = (phrase.end - phrase.start) / tokens.length;
    tokens.forEach((word, index) => {
      words.push({
        word,
        start: phrase.start + index * slot,
        end: Math.min(phrase.end, phrase.start + (index + 0.9) * slot),
      });
    });
  }
  return words;
}

export async function alignWithGeminiStt(
  input: {
    audioBuffer: Buffer;
    fileExtension: string;
    phraseCount?: number;
    scriptText?: string;
    languageCode?: string;
  },
  isRetry = false
): Promise<{ words: WordTimestamp[]; phrases: PhraseTimestamp[] }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Google AI API key not configured for Gemini STT.");

  // Determine language description for the prompt
  const langCode = input.languageCode ?? "kn-IN";
  let languageDesc = "Kannada + English real-estate";
  if (langCode.startsWith("en-")) {
    languageDesc = "English real-estate";
  } else if (langCode.startsWith("hi-")) {
    languageDesc = "Hindi + English real-estate";
  } else if (langCode.startsWith("kn-")) {
    languageDesc = "Kannada + English real-estate";
  }

  // Build reference text block if original script is available
  const referenceBlock = input.scriptText
    ? `\nREFERENCE TRANSCRIPT (use this to ensure word-accurate transcription — match these words exactly):\n"""\n${input.scriptText.substring(0, 3000)}\n"""\n`
    : "";

  const prompt = `Transcribe this ${languageDesc} narration into SRT subtitles.
Rules:
- Output valid SRT only. No markdown, no explanation.
- Preserve English words in English script when they are spoken as English terms, such as DC Converted, E-Khata, RERA, Ring Road, Mysore, Bangalore, Highway, Villa Plot.
- Non-English speech should be written in its native script (Kannada/Hindi/etc.).
- Use natural phrase-level captions, not word-level captions.
- Prefer ${input.phraseCount ?? 8} SRT cues if the audio supports it.
- Every cue must include accurate start and end timestamps in the exact format HH:MM:SS,mmm (e.g. 00:01:23,450).
- Timestamps must be precise — align word boundaries carefully.${referenceBlock}`;

  const url = `${GEMINI_ENDPOINT}/${getSttModel()}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: formatMimeType(input.fileExtension),
              data: input.audioBuffer.toString("base64"),
            },
          },
        ],
      }],
      safetySettings: [
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      ],
    }),
  });

  if (!res.ok) {
    if (res.status === 503 && !isRetry) {
      console.warn(`[STT] Got 503 High Demand from Gemini STT. Retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      return alignWithGeminiStt(input, true);
    }
    
    let message = `Gemini STT API error: ${res.status}`;
    try {
      const errorJson = await res.json();
      if (errorJson.error?.message) {
        message += ` - ${errorJson.error.message}`;
      }
    } catch {
      message += ` - ${await res.text()}`;
    }
    throw new Error(message);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("\n")
    .trim();
  const phrases = parseSrt(text ?? "");
  if (phrases.length === 0) {
    throw new Error(`Gemini STT returned no parseable SRT cues. Response preview: ${(text ?? "").slice(0, 500)}`);
  }

  return { phrases, words: wordsFromPhrases(phrases) };
}
