/**
 * Deterministic parser for hand-written conversation / skit scripts.
 *
 * The Skit Studio takes a screenplay-ish Kanglish script (see the example
 * below) and turns it into an ordered list of spoken lines with a detected
 * cast — with NO LLM call. Parsing is cheap and instant so it can run in the
 * browser on every keystroke, which is what powers live character detection.
 *
 * Recognised shape (loose — real scripts are messy):
 *
 *   Scene 3 — The Interrogation        <- heading  (direction, not spoken)
 *   6-15 sec                           <- timecode (direction, not spoken)
 *   Dish Wash slides into frame.       <- stage direction (not spoken)
 *   Dish Wash:                         <- speaker cue
 *   "Swalpa fingerprints aste alva?"   <- that speaker's spoken line
 *   G3:  "I am."                       <- speaker cue + inline spoken line
 *
 * Stage directions are never SPOKEN, but they are not thrown away: the ones
 * that precede a line are attached to it as the "situation" (`directionBefore`)
 * so TTS can perform the line in-context, and explicit "Pause / Beat / Hold"
 * cues become a real silence before the line (`pauseBeforeMs`).
 *
 * Design decisions:
 * - A "speaker cue" is a short line of the form `Name:` (optionally with the
 *   first bit of dialogue after the colon). The name must look like a name
 *   (few words, no sentence-ending punctuation) so prose containing a colon
 *   ("Note: ...") isn't mistaken for a character.
 * - Lines that follow a cue, up to the next blank line / cue / heading, belong
 *   to that speaker. A blank line closes the current speaker.
 */

export type SkitBlockKind = "dialogue" | "direction";

export interface SkitBlock {
  /** Stable id for React keys + preview clip correlation. */
  id: string;
  kind: SkitBlockKind;
  /** Present on dialogue blocks. */
  speaker?: string;
  /** Spoken text (dialogue) or the raw direction text. */
  text: string;
}

export interface SkitLine {
  id: string;
  speaker: string;
  text: string;
  /** Stage directions between the previous line and this one — the "situation". */
  directionBefore?: string;
  /** Current scene heading, if any. */
  scene?: string;
  /** Silence to hold before this line, derived from pause/beat/hold cues. */
  pauseBeforeMs?: number;
}

export interface ParsedSkit {
  blocks: SkitBlock[];
  /** Only the spoken dialogue, in order — what gets synthesized. */
  lines: SkitLine[];
  /** Unique speakers in order of first appearance. */
  characters: string[];
  wordCount: number;
}

/** A cue like `G3:` or `Dish Wash: "..."`. Group 1 = name, group 2 = trailing text. */
const SPEAKER_CUE = /^\s*([^:\n]{1,32}?)\s*:\s*(.*)$/;

/** Headings we always treat as directions even if oddly punctuated. */
const HEADING_PREFIX = /^\s*(scene|int\.|ext\.|cut to|fade|title|beat|pause|hold)\b/i;

/** Scene / slug headings — kept as broad context rather than a per-line "moment". */
const SCENE_HEADING = /^\s*(scene\b|int\.|ext\.)/i;

/** Timecode-ish lines ("6-15 sec", "0:05", "10s") carry no acting context. */
const TIMECODE_ONLY = /^[\d\s:.–—-]+(s|sec|secs|second|seconds|min|mins|minute|minutes)?\.?$/i;

/**
 * Does the text before a colon plausibly read as a character name rather than
 * the start of a sentence? Names are short, 1-4 words, and don't contain
 * sentence punctuation or trailing prose markers.
 */
function looksLikeSpeaker(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.length > 32) return false;
  // Sentence-ish punctuation inside the "name" -> it's prose, not a cue.
  if (/[.!?,;"“”]/.test(trimmed)) return false;
  // A name is a handful of words at most ("Dish Wash", "Old Man 2").
  if (trimmed.split(/\s+/).length > 4) return false;
  // Must contain at least one letter or digit (avoid "---:" style noise).
  // \p{L}/\p{N} keep Kannada/Devanagari character names valid too.
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return false;
  return true;
}

/** Silence (ms) implied by an explicit timing cue in a stage direction. */
function pauseMsFromDirection(text: string): number {
  const t = text.toLowerCase();
  if (/\blong pause\b|awkward silence|beat of silence/.test(t)) return 1000;
  if (/\bpause\b|\bsilence\b|\bwaits?\b/.test(t)) return 600;
  if (/\bhold\b|comedy beat|\bbeat\b/.test(t)) return 550;
  return 0;
}

/** Strip wrapping quotes / stray markdown that shouldn't be spoken. */
function cleanSpokenText(text: string): string {
  return text
    .trim()
    .replace(/^["'“”‘’(]+/, "")
    .replace(/["'“”‘’)]+$/, "")
    .replace(/^[-–—*]\s*/, "")
    .trim();
}

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

/** Canonical speaker key so "G3", "g3 " and "G3  " map to one character. */
export function normalizeSpeaker(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function parseSkit(raw: string): ParsedSkit {
  uidCounter = 0;
  const blocks: SkitBlock[] = [];
  const lines: SkitLine[] = [];
  const characters: string[] = [];
  const seen = new Set<string>();

  // Directions seen since the last spoken line — attached to the next one.
  let pendingDirections: string[] = [];
  let currentScene: string | undefined;

  const registerCharacter = (name: string) => {
    const key = normalizeSpeaker(name);
    if (!seen.has(key)) {
      seen.add(key);
      characters.push(key);
    }
    return key;
  };

  const pushDirection = (text: string) => {
    blocks.push({ id: uid("dir"), kind: "direction", text });
    if (SCENE_HEADING.test(text)) {
      currentScene = text;
    } else if (!TIMECODE_ONLY.test(text)) {
      // Timecodes are kept as blocks for display but carry no acting context.
      pendingDirections.push(text);
    }
  };

  const pushDialogueChunk = (speaker: string, text: string) => {
    const spoken = cleanSpokenText(text);
    if (!spoken) return;
    // Merge consecutive spoken lines from the same speaker into one utterance,
    // preserving the first chunk's attached direction/scene.
    const last = blocks[blocks.length - 1];
    if (last && last.kind === "dialogue" && last.speaker === speaker) {
      last.text = `${last.text} ${spoken}`.trim();
      const lastLine = lines[lines.length - 1];
      if (lastLine) lastLine.text = last.text;
      return;
    }
    const directionBefore = pendingDirections.join(" ").trim() || undefined;
    const pauseBeforeMs = pendingDirections.reduce(
      (max, d) => Math.max(max, pauseMsFromDirection(d)),
      0
    );
    pendingDirections = [];

    const id = uid("line");
    blocks.push({ id, kind: "dialogue", speaker, text: spoken });
    lines.push({
      id,
      speaker,
      text: spoken,
      ...(directionBefore ? { directionBefore } : {}),
      ...(currentScene ? { scene: currentScene } : {}),
      ...(pauseBeforeMs ? { pauseBeforeMs } : {}),
    });
  };

  const rawLines = raw.replace(/\r\n/g, "\n").split("\n");
  let currentSpeaker: string | null = null;

  for (const rawLine of rawLines) {
    const line = rawLine.trim();

    if (!line) {
      // Blank line closes the current speaker's turn.
      currentSpeaker = null;
      continue;
    }

    if (HEADING_PREFIX.test(line)) {
      currentSpeaker = null;
      pushDirection(line);
      continue;
    }

    const cue = line.match(SPEAKER_CUE);
    if (cue && looksLikeSpeaker(cue[1])) {
      const speaker = registerCharacter(cue[1]);
      currentSpeaker = speaker;
      const inline = cue[2]?.trim();
      if (inline) pushDialogueChunk(speaker, inline);
      continue;
    }

    if (currentSpeaker) {
      // Continuation of the current speaker's dialogue.
      pushDialogueChunk(currentSpeaker, line);
      continue;
    }

    // Free-standing prose = stage direction.
    pushDirection(line);
  }

  const wordCount = lines.reduce(
    (sum, l) => sum + l.text.split(/\s+/).filter(Boolean).length,
    0
  );

  return { blocks, lines, characters, wordCount };
}
