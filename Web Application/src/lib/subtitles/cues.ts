import type { AudioSyncData } from "@/lib/tts/types";
import type { SubtitleCue, SubtitleWord } from "@/lib/subtitles/types";

function uid(prefix: string, i: number): string {
  return `${prefix}-${i}`;
}

function closeCueGaps(cues: SubtitleCue[]): SubtitleCue[] {
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < sorted.length - 1; i++) {
    sorted[i].endMs = Math.max(sorted[i].startMs + 200, sorted[i + 1].startMs);
  }
  return sorted;
}

export function wordsInRange(
  words: AudioSyncData["words"],
  startSec: number,
  endSec: number
): SubtitleWord[] {
  return words
    .filter((w) => w.start >= startSec - 0.05 && w.end <= endSec + 0.15)
    .map((w) => ({
      word: w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
    }));
}

/** Split word-level timestamps into multiple timed subtitle cues.
 *  Each cue is capped at `maxCharsPerCue` characters (default 100).
 *  Falls back to a single cue when no word timestamps exist. */
export function cuesFromAudioSync(
  sync: AudioSyncData,
  options?: { maxCharsPerCue?: number; maxDurationMs?: number; maxWordsPerCue?: number }
): SubtitleCue[] {
  const authored = sync.authoredPhrases?.filter(
    (phrase) => phrase.display.trim().length > 0 && phrase.start !== undefined && phrase.end !== undefined && phrase.end > phrase.start
  );
  if (authored && authored.length > 0) {
    const cues = authored.map((phrase, index) => ({
      id: phrase.id || uid("cue", index),
      startMs: Math.round((phrase.start ?? 0) * 1000),
      endMs: Math.round((phrase.end ?? 0) * 1000),
      text: phrase.display,
      words: wordsInRange(sync.words, phrase.start ?? 0, phrase.end ?? 0),
    }));
    return closeCueGaps(cues);
  }

  if (sync.words.length === 0) return [];

  const maxChars = options?.maxCharsPerCue ?? 54;
  return closeCueGaps(cuesFromWordsOnly(sync.words, maxChars, {
    maxDurationMs: options?.maxDurationMs ?? 3200,
    maxWordsPerCue: options?.maxWordsPerCue ?? 7,
  }));
}

export function cuesFromWordsOnly(
  words: AudioSyncData["words"],
  maxChars: number,
  options?: { maxDurationMs?: number; maxWordsPerCue?: number }
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let chunk: typeof words = [];
  let idx = 0;
  const maxDurationMs = options?.maxDurationMs ?? 3200;
  const maxWordsPerCue = options?.maxWordsPerCue ?? 7;

  const flush = () => {
    if (chunk.length === 0) return;
    const text = chunk.map((w) => w.word).join(" ");
    cues.push({
      id: uid("cue", idx++),
      startMs: Math.round(chunk[0].start * 1000),
      endMs: Math.round(chunk[chunk.length - 1].end * 1000),
      text,
      words: chunk.map((w) => ({
        word: w.word,
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000),
      })),
    });
    chunk = [];
  };

  const shouldBreakAfter = (word: string) => /[.!?,:;।॥]|[.!?,:;]$/.test(word);

  for (const w of words) {
    const next = [...chunk, w];
    const nextText = next.map((x) => x.word).join(" ");
    const nextDurationMs = next.length > 0 ? (next[next.length - 1].end - next[0].start) * 1000 : 0;

    if (
      chunk.length > 0 &&
      (nextText.length > maxChars ||
        nextDurationMs > maxDurationMs ||
        next.length > maxWordsPerCue)
    ) {
      flush();
    }
    chunk.push(w);

    if (chunk.length >= 2 && shouldBreakAfter(w.word)) {
      flush();
    }
  }
  flush();
  return cues;
}

export function formatSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msPart = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(msPart).padStart(3, "0")}`;
}

export function cuesToSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, i) => {
      const lines = cue.text.split("\n").join("\n");
      return `${i + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${lines}\n`;
    })
    .join("\n");
}

function formatAssTime(ms: number): string {
  const totalCs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(totalCs / 360000);
  const m = Math.floor((totalCs % 360000) / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");
}

export function cuesToAss(cues: SubtitleCue[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ReelCaption,Noto Sans Kannada,72,&H00FFFFFF,&H0000FFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,5,2,2,80,80,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = cues.map((cue) => {
    return `Dialogue: 0,${formatAssTime(cue.startMs)},${formatAssTime(cue.endMs)},ReelCaption,,0,0,0,,${escapeAssText(cue.text)}`;
  });

  return [header, ...events].join("\n");
}

/** Timed caption for the editor timeline — seconds, aligned to SRT cue boundaries. */
export type EditorCaption = {
  text: string;
  start: number;
  end: number;
  words?: SubtitleWord[];
};

/** Convert saved subtitle cues into editor captions with non-overlapping SRT timing. */
export function cuesToEditorCaptions(cues: SubtitleCue[]): EditorCaption[] {
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
  return sorted
    .map((cue, i) => {
      let endMs = cue.endMs;
      if (i < sorted.length - 1) {
        endMs = Math.max(cue.startMs + 200, sorted[i + 1].startMs);
      }
      endMs = Math.max(cue.startMs + 200, endMs);
      return {
        text: cue.text.trim(),
        start: Number((cue.startMs / 1000).toFixed(3)),
        end: Number((endMs / 1000).toFixed(3)),
        words: cue.words?.length ? cue.words : undefined,
      };
    })
    .filter((c) => c.text.length > 0 && c.end > c.start);
}

export function parseCuesJson(raw: unknown): SubtitleCue[] {
  if (!Array.isArray(raw)) return [];
  const parsed = raw
    .filter((c) => c && typeof c === "object")
    .map((c, i) => {
      const o = c as Record<string, unknown>;
      const words = Array.isArray(o.words)
        ? (o.words as Record<string, unknown>[]).map((w) => ({
            word: String(w.word ?? ""),
            startMs: Number(w.startMs) || 0,
            endMs: Number(w.endMs) || 0,
          }))
        : [];
      return {
        id: String(o.id ?? `cue-${i}`),
        startMs: Number(o.startMs) || 0,
        endMs: Number(o.endMs) || 0,
        text: String(o.text ?? ""),
        words,
      };
    })
    .filter((c) => c.text.length > 0 && c.endMs > c.startMs);

  return closeCueGaps(parsed);
}
