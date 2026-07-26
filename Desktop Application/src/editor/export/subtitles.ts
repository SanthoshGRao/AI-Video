/**
 * subtitles.ts — builds an .ass subtitle file from a SubtitleTrack row so
 * ffmpeg's native `subtitles=` filter (libass) can burn it in directly.
 * Reuses the same proven technique the old pipeline used
 * (Web Application/src/lib/subtitles/ass-export.ts) rather than
 * hand-rolling per-frame text rendering — libass already handles
 * word-timed highlighting via ASS karaoke (`\k`) tags well.
 */

import fs from "fs";
import path from "path";
import os from "os";

export interface SubtitleCueWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words?: SubtitleCueWord[];
}

export interface SubtitleStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  highlightColor?: string;
  position?: "top" | "middle" | "bottom";
}

function toAssTime(ms: number): string {
  const totalCentiseconds = Math.round(ms / 10);
  const h = Math.floor(totalCentiseconds / 360000);
  const m = Math.floor((totalCentiseconds % 360000) / 6000);
  const s = Math.floor((totalCentiseconds % 6000) / 100);
  const cs = totalCentiseconds % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function hexToAssColor(hex: string | undefined, fallback = "&H00FFFFFF"): string {
  if (!hex) return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const r = m[1].slice(0, 2);
  const g = m[1].slice(2, 4);
  const b = m[1].slice(4, 6);
  // ASS colors are &HAABBGGRR
  return `&H00${b}${g}${r}`.toUpperCase();
}

function alignmentFor(position: SubtitleStyle["position"]): number {
  // Numpad-style ASS alignment: 2 = bottom-center, 8 = top-center.
  if (position === "top") return 8;
  if (position === "middle") return 5;
  return 2;
}

function escapeAssText(text: string): string {
  return text.replace(/\n/g, "\\N").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

export function buildAssFile(
  cues: SubtitleCue[],
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number
): string {
  const fontName = style.fontFamily || "Arial";
  const fontSize = style.fontSize || Math.round(canvasHeight * 0.045);
  const primaryColor = hexToAssColor(style.color, "&H00FFFFFF");
  const highlightColor = hexToAssColor(style.highlightColor, "&H0000D7FF");
  const alignment = alignmentFor(style.position);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${canvasWidth}
PlayResY: ${canvasHeight}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${highlightColor},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,${alignment},40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = cues.map((cue) => {
    let text: string;
    if (cue.words && cue.words.length > 0) {
      // Karaoke fill: \k tags take centiseconds per word.
      text = cue.words
        .map((w) => `{\\k${Math.max(1, Math.round((w.endMs - w.startMs) / 10))}}${escapeAssText(w.word)} `)
        .join("");
    } else {
      text = escapeAssText(cue.text);
    }
    return `Dialogue: 0,${toAssTime(cue.startMs)},${toAssTime(cue.endMs)},Default,,0,0,0,,${text}`;
  });

  return header + lines.join("\n") + "\n";
}

export interface TitleClipForAss {
  text: string;
  startSec: number;
  endSec: number;
  /** Placement box, 0-100 percentages of the canvas (matches ClipTransform). */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

/**
 * ASS's `\fn` tag takes ONE font name, but the editor stores a CSS
 * font-family *list* (e.g. `Playfair Display, serif`). Passing the list
 * verbatim matches no installed font, so libass silently falls back to its
 * default — which is why exported titles came out in a plain sans-serif
 * regardless of the font chosen in the editor.
 */
function primaryFontName(family: string | undefined, fallback: string): string {
  if (!family) return fallback;
  const first = family.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  return first || fallback;
}

/**
 * Wraps `text` to `maxWidthPx`, mirroring the editor preview's Canvas2D
 * `wrapText()` (see editor-renderer/src/gl/text-texture-cache.ts) so a title
 * breaks across the same number of lines in the export as on screen.
 *
 * Line breaking used to not happen at all here: every title was emitted as a
 * single `\pos()`-centred line, so anything wider than its box ran off both
 * edges of the frame instead of wrapping inside it.
 *
 * Width is *estimated* rather than measured — this runs in the main process
 * with no font metrics available, and shelling out to a text shaper per
 * title would be far more machinery than the payoff justifies. The estimate
 * is deliberately slightly wide, so the failure mode is an early break
 * (text stays inside its box) rather than a late one (text overflows).
 */
function wrapAssText(text: string, fontSize: number, bold: boolean, maxWidthPx: number): string[] {
  const avgAdvance = fontSize * (bold ? 0.58 : 0.54);
  const maxChars = Math.max(1, Math.floor(maxWidthPx / avgAdvance));

  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines.filter((l, i) => l.length > 0 || i === 0);
}

/**
 * Builds an .ass file for TEXT clips (title cards), positioned via ASS
 * `\pos()` override tags at each clip's own box center — the GPU compositor
 * (gpu-compositor, Web Application) doesn't render text yet, so this is the
 * export engine's text path for now, same technique as buildAssFile() above
 * for transcription subtitles. Burned in as a second, separate `subtitles=`
 * filter pass after the main video encode (see export-runner.ts).
 */
export function buildTitleAssFile(titles: TitleClipForAss[], canvasWidth: number, canvasHeight: number): string {
  const defaultFontSize = Math.round(canvasHeight * 0.05);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${canvasWidth}
PlayResY: ${canvasHeight}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${defaultFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = titles.map((t) => {
    const fontName = primaryFontName(t.fontFamily, "Arial");
    const fontSize = t.fontSize || defaultFontSize;
    const bold = t.bold !== false;
    const color = hexToAssColor(t.color, "&H00FFFFFF");
    const cx = Math.round(((t.xPct + t.wPct / 2) / 100) * canvasWidth);
    const cy = Math.round(((t.yPct + t.hPct / 2) / 100) * canvasHeight);
    const boxWidth = Math.max(1, (t.wPct / 100) * canvasWidth);

    // \an5 centres on \pos, so the wrapped block grows symmetrically about
    // the box centre — same as the preview's centred text layout.
    const wrapped = wrapAssText(t.text, fontSize, bold, boxWidth)
      .map(escapeAssText)
      .join("\\N");

    // hexToAssColor() returns "&H00BBGGRR" (script-info format, with an
    // alpha byte); the \c inline override tag needs "&HBBGGRR&" instead.
    const override =
      `{\\an5\\pos(${cx},${cy})\\fn${fontName}\\fs${fontSize}` +
      `\\b${bold ? 1 : 0}\\i${t.italic ? 1 : 0}\\c&H${color.slice(4)}&}`;
    return `Dialogue: 0,${toAssTime(t.startSec * 1000)},${toAssTime(t.endSec * 1000)},Default,,0,0,0,,${override}${wrapped}`;
  });

  return header + lines.join("\n") + "\n";
}

/** Writes the .ass to a temp file and returns its path, escaped for use
 * inside an ffmpeg filter argument (ffmpeg's subtitles filter needs
 * backslashes and colons escaped on Windows). */
export function writeAssFile(assContent: string, jobId: string): { path: string; filterPath: string } {
  const tempPath = path.join(os.tmpdir(), `video-studio-export-${jobId}.ass`);
  fs.writeFileSync(tempPath, assContent, "utf-8");
  const filterPath = tempPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  return { path: tempPath, filterPath };
}
