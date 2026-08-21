/**
 * text-renderer.ts — THE text rasteriser.
 *
 * One Canvas2D implementation of layout + painting, shared by the editor
 * preview (via the GPU preview bridge) and by the export compositor. Both
 * call `renderTextLayer()` with the same resolved style scaled to their own
 * canvas, so preview and export differ only by that scale factor — they
 * cannot drift apart the way six hand-maintained implementations did.
 *
 * Layout rules here are the DOM preview's rules, made explicit:
 *  - text wraps to the box width minus horizontal padding
 *  - lines stack at `lineHeightPx` and the block is vertically centred in
 *    the box (the DOM preview centres its pill in a taller overlay zone)
 *  - the background pill hugs the widest line, not the full box
 *
 * Word-level highlight (karaoke / highlight / word_pop) is handled here too,
 * so an exported frame highlights exactly the word the preview does at the
 * same timestamp.
 */
import { cssFontString, type ResolvedTextStyle } from "./text-style";

export interface TextWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface TextLayerInput {
  text: string;
  style: ResolvedTextStyle;
  /** Box the text is laid out in, in device pixels. */
  boxWidth: number;
  boxHeight: number;
  /** Per-word timings, for highlight animations. */
  words?: TextWord[];
  /** Playhead position within the clip's own timeline, in ms — decides which
   * word is "active". */
  timeMs?: number;
}

interface LaidOutWord {
  text: string;
  index: number;
  x: number;
  width: number;
}

interface LaidOutLine {
  words: LaidOutWord[];
  text: string;
  width: number;
  y: number;
}

/**
 * Canvas2D gained a `letterSpacing` property only recently and it is still
 * absent in some engines. Measuring with an explicit per-character advance
 * keeps layout identical whether or not the native property exists — which
 * matters because the preview and the export can be running different
 * Chromium builds.
 */
function measure(ctx: CanvasTextDrawingStyles & CanvasText, text: string, letterSpacing: number): number {
  const base = (ctx as unknown as CanvasRenderingContext2D).measureText(text).width;
  return letterSpacing ? base + letterSpacing * Math.max(0, text.length - 1) : base;
}

/** Draws a run honouring letterSpacing, character by character when needed.
 * Returns the advance so callers can position the next run. */
function drawRun(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
  mode: "fill" | "stroke",
): number {
  if (!letterSpacing) {
    if (mode === "fill") ctx.fillText(text, x, y);
    else ctx.strokeText(text, x, y);
    return ctx.measureText(text).width;
  }
  let cursor = x;
  for (const ch of text) {
    if (mode === "fill") ctx.fillText(ch, cursor, y);
    else ctx.strokeText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + letterSpacing;
  }
  return cursor - x;
}

/**
 * Wraps `text` to `maxWidth` and positions every word, so the painter can
 * colour individual words without re-measuring (and getting a different
 * answer than layout did).
 */
export function layoutText(
  ctx: CanvasRenderingContext2D,
  text: string,
  rs: ResolvedTextStyle,
  maxWidth: number,
): { lines: LaidOutLine[]; blockHeight: number; maxLineWidth: number } {
  ctx.font = cssFontString(rs);
  const spaceWidth = ctx.measureText(" ").width + rs.letterSpacingPx;

  const lines: LaidOutLine[] = [];
  let wordIndex = 0;

  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current: LaidOutWord[] = [];
    let width = 0;

    const flush = () => {
      lines.push({
        words: current,
        text: current.map((w) => w.text).join(" "),
        width: Math.max(0, width - spaceWidth),
        y: 0,
      });
      current = [];
      width = 0;
    };

    for (const word of words) {
      const w = measure(ctx, word, rs.letterSpacingPx);
      if (current.length > 0 && width + w > maxWidth) flush();
      current.push({ text: word, index: wordIndex++, x: width, width: w });
      width += w + spaceWidth;
    }
    flush();
  }

  // Re-anchor each word's x for the line's alignment.
  let maxLineWidth = 0;
  for (const line of lines) maxLineWidth = Math.max(maxLineWidth, line.width);

  return { lines, blockHeight: lines.length * rs.lineHeightPx, maxLineWidth };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Rasterises one text element into a canvas exactly the size of its box.
 *
 * The returned canvas is uploaded as an ordinary compositor layer, so
 * rotation, scale, anchor, position and layer opacity are applied by the
 * same quad transform every other layer uses — this function is only
 * responsible for what happens *inside* the box.
 */
export function renderTextLayer(
  input: TextLayerInput,
  createCanvas: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas,
): HTMLCanvasElement | OffscreenCanvas | null {
  const { text, style: rs, words, timeMs } = input;
  const w = Math.max(1, Math.round(input.boxWidth));
  const h = Math.max(1, Math.round(input.boxHeight));
  if (!text) return null;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) return null;

  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = "middle";
  ctx.font = cssFontString(rs);

  const contentWidth = Math.max(1, w - rs.paddingXPx * 2);
  const { lines, blockHeight, maxLineWidth } = layoutText(ctx, text, rs, contentWidth);

  // Vertically centre the block in the box, like the DOM preview's pill.
  const blockTop = (h - blockHeight) / 2;

  if (rs.backgroundColor) {
    const bgW = Math.min(w, maxLineWidth + rs.paddingXPx * 2);
    const bgH = blockHeight + rs.paddingYPx * 2;
    const bgX = rs.align === "left" ? 0 : rs.align === "right" ? w - bgW : (w - bgW) / 2;
    ctx.fillStyle = rs.backgroundColor;
    roundRectPath(ctx, bgX, blockTop - rs.paddingYPx, bgW, bgH, rs.borderRadiusPx);
    ctx.fill();
  }

  const activeWord =
    words && words.length > 0 && typeof timeMs === "number"
      ? words.findIndex((word) => timeMs >= word.startMs && timeMs < word.endMs)
      : -1;
  const highlighting =
    activeWord >= 0 &&
    (rs.animation === "karaoke" || rs.animation === "highlight" || rs.animation === "word_pop");

  ctx.globalAlpha = rs.opacity;

  lines.forEach((line, lineIndex) => {
    const baselineY = blockTop + lineIndex * rs.lineHeightPx + rs.lineHeightPx / 2;
    const lineStartX =
      rs.align === "left"
        ? rs.paddingXPx
        : rs.align === "right"
          ? w - rs.paddingXPx - line.width
          : (w - line.width) / 2;

    // Shadow is applied to the stroke/fill of the text itself, and cleared
    // before the next pass so it isn't stacked once per pass.
    const applyShadow = () => {
      if (!rs.shadow) return;
      ctx.shadowOffsetX = rs.shadow.offsetX;
      ctx.shadowOffsetY = rs.shadow.offsetY;
      ctx.shadowBlur = rs.shadow.blur;
      ctx.shadowColor = rs.shadow.color;
    };
    const clearShadow = () => {
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    };

    // Outline first so the fill sits on top of it (paint-order: stroke fill),
    // matching the DOM preview's `paintOrder: "stroke fill"`.
    if (rs.strokeColor && rs.strokeWidthPx > 0) {
      applyShadow();
      ctx.strokeStyle = rs.strokeColor;
      ctx.lineWidth = rs.strokeWidthPx;
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      let cursor = lineStartX;
      for (const word of line.words) {
        cursor += drawRun(ctx, word.text, cursor, baselineY, rs.letterSpacingPx, "stroke");
        cursor += ctx.measureText(" ").width + rs.letterSpacingPx;
      }
      clearShadow();
    }

    if (!rs.strokeColor || rs.strokeWidthPx <= 0) applyShadow();
    let cursor = lineStartX;
    for (const word of line.words) {
      ctx.fillStyle =
        highlighting && word.index === activeWord && rs.highlightColor
          ? rs.highlightColor
          : rs.color;
      // word_pop dims words that haven't been spoken yet, same as the preview.
      const dim = rs.animation === "word_pop" && activeWord >= 0 && word.index > activeWord;
      const priorAlpha = ctx.globalAlpha;
      if (dim) ctx.globalAlpha = priorAlpha * 0.45;

      const advance = drawRun(ctx, word.text, cursor, baselineY, rs.letterSpacingPx, "fill");

      if (rs.underline) {
        const thickness = Math.max(1, rs.fontSizePx * 0.06);
        ctx.fillRect(cursor, baselineY + rs.fontSizePx * 0.34, advance, thickness);
      }

      if (dim) ctx.globalAlpha = priorAlpha;
      cursor += advance + ctx.measureText(" ").width + rs.letterSpacingPx;
    }
    clearShadow();
  });

  ctx.globalAlpha = 1;
  return canvas;
}
