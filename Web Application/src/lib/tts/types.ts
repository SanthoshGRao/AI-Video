export type WordTimestamp = {
  word: string;
  start: number;
  end: number;
};

export type SentenceTimestamp = {
  text: string;
  start: number;
  end: number;
};

export type PhraseTimestamp = {
  text: string;
  start: number;
  end: number;
};

export type SubtitlePhrase = {
  id: string;
  display: string;
  spoken?: string;
  start?: number;
  end?: number;
};

export type SyncSource = "whisperx" | "google-stt" | "google_speech" | "estimated" | "stable-ts";

/** Stored in AudioAsset.wordTimestamps (v1 envelope or legacy word array). */
export type AudioSyncData = {
  version: 1;
  words: WordTimestamp[];
  sentences: SentenceTimestamp[];
  phrases?: PhraseTimestamp[];
  authoredPhrases?: SubtitlePhrase[];
  syncSource: SyncSource;
};

export function parseAudioSync(raw: unknown): AudioSyncData | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const words = raw as WordTimestamp[];
    return {
      version: 1,
      words,
      sentences: buildSentencesFromWords(words),
      phrases: buildPhrasesFromWords(words),
      syncSource: "stable-ts",
    };
  }
  if (typeof raw === "object" && raw !== null && "words" in raw) {
    const o = raw as Record<string, unknown>;
    const syncSource = typeof o.syncSource === "string" ? o.syncSource : "stable-ts";
    const validSources = ["whisperx", "google-stt", "google_speech", "estimated", "stable-ts"];
    if (!validSources.includes(syncSource)) return null;
    const words = (Array.isArray(o.words) ? o.words : []) as WordTimestamp[];
    return {
      version: 1,
      words: (Array.isArray(o.words) ? o.words : []) as WordTimestamp[],
      sentences: (Array.isArray(o.sentences) ? o.sentences : buildSentencesFromWords(words)) as SentenceTimestamp[],
      phrases: (Array.isArray(o.phrases) ? o.phrases : buildPhrasesFromWords(words)) as PhraseTimestamp[],
      authoredPhrases: Array.isArray(o.authoredPhrases) ? (o.authoredPhrases as SubtitlePhrase[]) : undefined,
      syncSource: syncSource as SyncSource,
    };
  }
  return null;
}

export function buildSentencesFromWords(
  words: WordTimestamp[]
): SentenceTimestamp[] {
  const sentences: SentenceTimestamp[] = [];
  let chunk: WordTimestamp[] = [];

  const flush = () => {
    if (chunk.length === 0) return;
    sentences.push({
      text: chunk.map((w) => w.word).join(" "),
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
    chunk = [];
  };

  for (const w of words) {
    chunk.push(w);
    if (/[.!?]$/.test(w.word)) flush();
  }
  flush();
  return sentences;
}

export function buildPhrasesFromWords(words: WordTimestamp[]): PhraseTimestamp[] {
  if (words.length === 0) return [];
  const phrases: PhraseTimestamp[] = [];
  let chunk: WordTimestamp[] = [];

  const flush = () => {
    if (chunk.length === 0) return;
    phrases.push({
      text: chunk.map((w) => w.word).join(" "),
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
    chunk = [];
  };

  for (const w of words) {
    chunk.push(w);
    if (/[,:;.!?]$/.test(w.word) || chunk.length >= 5) flush();
  }
  flush();
  return phrases;
}
