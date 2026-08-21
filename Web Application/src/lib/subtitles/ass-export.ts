import type { SubtitleCue, SubtitleStyle } from "./types";

function msToAssTime(ms: number): string {
  const d = new Date(ms);
  const h = Math.max(0, d.getUTCHours()).toString(); // can exceed 24 in very long videos, but ok
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const s = d.getUTCSeconds().toString().padStart(2, "0");
  const cs = Math.floor(d.getUTCMilliseconds() / 10).toString().padStart(2, "0");
  return `${h}:${m}:${s}.${cs}`;
}

function hexToAssColor(hex: string): string {
  // ASS uses &HAABBGGRR format (Blue, Green, Red)
  const cleanHex = hex.replace("#", "").padEnd(6, "0");
  const r = cleanHex.substring(0, 2);
  const g = cleanHex.substring(2, 4);
  const b = cleanHex.substring(4, 6);
  // Default to full opacity (00)
  return `&H00${b}${g}${r}`;
}

function hexToAssAlpha(hex: string, opacityPercent: number): string {
  // Alpha in ASS is 00 (opaque) to FF (transparent)
  const alpha = Math.round((1 - opacityPercent / 100) * 255).toString(16).padStart(2, "0").toUpperCase();
  const cleanHex = hex.replace("#", "").padEnd(6, "0");
  const r = cleanHex.substring(0, 2);
  const g = cleanHex.substring(2, 4);
  const b = cleanHex.substring(4, 6);
  return `&H${alpha}${b}${g}${r}`;
}

function parseRgbaString(rgba: string): { r: number, g: number, b: number, a: number } {
  if (rgba.startsWith("rgba(")) {
    const parts = rgba.replace("rgba(", "").replace(")", "").split(",");
    if (parts.length >= 4) {
      return {
        r: parseInt(parts[0].trim(), 10),
        g: parseInt(parts[1].trim(), 10),
        b: parseInt(parts[2].trim(), 10),
        a: parseFloat(parts[3].trim())
      };
    }
  }
  return { r: 0, g: 0, b: 0, a: 0.5 };
}

function rgbaToAssColorWithAlpha(rgba: string): string {
  const parsed = parseRgbaString(rgba);
  const r = parsed.r.toString(16).padStart(2, "0").toUpperCase();
  const g = parsed.g.toString(16).padStart(2, "0").toUpperCase();
  const b = parsed.b.toString(16).padStart(2, "0").toUpperCase();
  const alpha = Math.round((1 - parsed.a) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `&H${alpha}${b}${g}${r}`;
}

/**
 * Generate Advanced SubStation Alpha (ASS) format from cues and styles.
 * Preserves font, color, stroke, background, and positioning.
 */
export function cuesToAss(cues: SubtitleCue[], style: SubtitleStyle, width = 1080, height = 1920): string {
  // Map our position to ASS Alignment
  // 1=BottomLeft, 2=BottomCenter, 3=BottomRight
  // 4=MidLeft,    5=MidCenter,    6=MidRight
  // 7=TopLeft,    8=TopCenter,    9=TopRight
  let alignment = 2; // Default bottom center
  if (style.position === "top") alignment = 8;
  if (style.position === "center") alignment = 5;

  const fontName = style.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
  const primaryColor = hexToAssColor(style.color);
  
  // ASS uses outline (stroke) color as secondary
  const outlineColor = style.stroke ? hexToAssColor(style.strokeColor || "#000000") : "&H00000000";
  const outlineSize = style.stroke ? style.strokeWidth || 2 : 0;
  
  // Background box
  const backColor = style.backgroundColor.startsWith("rgba") 
    ? rgbaToAssColorWithAlpha(style.backgroundColor)
    : hexToAssAlpha(style.backgroundColor, 50); // fallback
  
  // Border style: 1=Outline+DropShadow, 3=OpaqueBox
  const borderStyle = style.backgroundColor !== "transparent" && style.backgroundColor !== "rgba(0,0,0,0)" ? 3 : 1;
  const shadowSize = style.shadow ? 2 : 0;
  const bold = style.fontWeight >= 600 ? -1 : 0; // -1 is true in ASS

  let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${style.fontSize},${primaryColor},${primaryColor},${outlineColor},${backColor},${bold},0,0,0,100,100,0,0,${borderStyle},${outlineSize},${shadowSize},${alignment},40,40,${style.position === "center" ? 0 : 80},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const cue of cues) {
    const start = msToAssTime(cue.startMs);
    const end = msToAssTime(cue.endMs);

    // In Karaoke mode with words, we can do Karaoke tags, but for standard FFmpeg burn-in
    // standard text is safer. We'll use standard text.
    let text = cue.text.replace(/\n/g, "\\N");

    ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
  }

  return ass;
}

export interface TitleCardForAss {
  text: string;
  startMs: number;
  endMs: number;
  /** Bounding box in the authored canvas' own pixel space (pre-scale). */
  x: number;
  y: number;
  w: number;
  h: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  italic?: boolean;
  underline?: boolean;
  backgroundColor?: string;
  stroke?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
}

/**
 * Generate an ASS track for freeform title/text overlays (as opposed to
 * spoken-word captions), positioned absolutely to match the editor's stage
 * layout instead of FFmpeg's generic bottom-of-frame subtitle placement —
 * otherwise titles land on top of (or invisibly behind) burned-in captions.
 */
export function titleClipsToAss(
  cards: TitleCardForAss[],
  authoredWidth: number,
  authoredHeight: number,
  outWidth: number,
  outHeight: number,
): string {
  const scaleX = authoredWidth > 0 ? outWidth / authoredWidth : 1;
  const scaleY = authoredHeight > 0 ? outHeight / authoredHeight : 1;
  const fontScale = (scaleX + scaleY) / 2;

  let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${outWidth}
PlayResY: ${outHeight}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const card of cards) {
    if (!card.text.trim()) continue;
    const start = msToAssTime(card.startMs);
    const end = msToAssTime(card.endMs);

    const fontName = (card.fontFamily || "Arial").split(",")[0].replace(/['"]/g, "").trim();
    const fontSize = Math.max(8, Math.round((card.fontSize || 48) * fontScale));
    const primaryColor = hexToAssColor(card.color || "#ffffff");
    const bold = (card.fontWeight ?? 700) >= 600 ? "\\b1" : "\\b0";
    const italic = card.italic ? "\\i1" : "\\i0";
    const underline = card.underline ? "\\u1" : "\\u0";
    const outline = card.stroke
      ? `\\3c${hexToAssColor(card.strokeColor || "#000000")}\\bord${Math.max(1, Math.round((card.strokeWidth || 2) * fontScale))}`
      : "\\bord0";

    // Anchor at the box's horizontal/vertical center (alignment 5) so text
    // wraps/centers the same way the editor stage does.
    const cx = Math.round((card.x + card.w / 2) * scaleX);
    const cy = Math.round((card.y + card.h / 2) * scaleY);

    const override = `{\\an5\\pos(${cx},${cy})\\fn${fontName}\\fs${fontSize}\\c${primaryColor}${bold}${italic}${underline}${outline}}`;
    const text = card.text.replace(/\n/g, "\\N");

    ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${override}${text}\n`;
  }

  return ass;
}
