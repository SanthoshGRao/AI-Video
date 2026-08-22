/**
 * text-texture-cache.ts — renders text clips to an offscreen 2D canvas
 * (reusing plain Canvas2D text layout — word-wrap/font-fallback via the
 * browser's own text shaping, same technique the old web app's
 * Compositor.renderFrame used) and uploads the result as a GL texture,
 * cached by a hash of (content, style, box size) so it's only redrawn
 * when those actually change — not every animation frame, which is the
 * concrete bug this replaces (see CanvasStage.tsx history / plan §4).
 */

import type { TextWord } from "./compositor";

interface CacheEntry {
  texture: WebGLTexture;
  key: string;
  lastUsedFrame: number;
}

const HIGHLIGHT_ANIMATIONS = new Set(["karaoke", "highlight", "word_pop"]);

export class TextTextureCache {
  private entries = new Map<string, CacheEntry>();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frameCounter = 0;

  constructor(private gl: WebGL2RenderingContext) {
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable for text rendering");
    this.ctx = ctx;
  }

  private hashKey(
    content: string,
    style: Record<string, unknown>,
    w: number,
    h: number,
    activeWordIndex: number
  ): string {
    return JSON.stringify([content, style, Math.round(w), Math.round(h), activeWordIndex]);
  }

  beginFrame(): void {
    this.frameCounter++;
  }

  /** Returns a texture for this text, drawing it only on a cache miss.
   * `words`/`activeWordIndex` drive per-word highlight animations — the key
   * includes the active word (not the raw playhead), so a cache hit still
   * covers every frame the highlighted word doesn't change on. */
  getOrRender(
    content: string,
    style: Record<string, unknown>,
    widthPx: number,
    heightPx: number,
    words?: TextWord[],
    activeWordIndex = -1
  ): WebGLTexture {
    const animation = typeof style.animation === "string" ? style.animation : undefined;
    const highlighting = !!words?.length && !!animation && HIGHLIGHT_ANIMATIONS.has(animation);
    const key = this.hashKey(content, style, widthPx, heightPx, highlighting ? activeWordIndex : -1);
    const cached = this.entries.get(key);
    if (cached) {
      cached.lastUsedFrame = this.frameCounter;
      return cached.texture;
    }

    const texture = highlighting
      ? this.renderHighlighted(style, widthPx, heightPx, words!, activeWordIndex)
      : this.render(content, style, widthPx, heightPx);
    this.entries.set(key, { texture, key, lastUsedFrame: this.frameCounter });
    return texture;
  }

  private uploadCanvasTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to create text texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    return texture;
  }

  /** Same layout as render(), but colors the active word with the style's
   * highlight color (and dims not-yet-spoken words for word_pop) — mirrors
   * the web editor's DOM preview (`StudioTextContent` in canvas-stage.tsx)
   * and the shared export rasteriser (`lib/text/text-renderer.ts`). */
  private renderHighlighted(
    style: Record<string, unknown>,
    widthPx: number,
    heightPx: number,
    words: TextWord[],
    activeWordIndex: number
  ): WebGLTexture {
    const w = Math.max(2, Math.round(widthPx));
    const h = Math.max(2, Math.round(heightPx));
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    const fontSize = typeof style.fontSize === "number" ? style.fontSize : Math.round(h * 0.6);
    const fontWeight = typeof style.fontWeight === "number" || typeof style.fontWeight === "string" ? style.fontWeight : 600;
    const fontFamily = typeof style.fontFamily === "string" ? style.fontFamily : "system-ui, sans-serif";
    const color = typeof style.color === "string" ? style.color : "#ffffff";
    const highlightColor = typeof style.highlightColor === "string" ? style.highlightColor : color;
    const align = (typeof style.align === "string" ? style.align : "center") as CanvasTextAlign;
    const animation = style.animation;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const spaceWidth = ctx.measureText(" ").width;
    type Run = { text: string; index: number; width: number };
    const lines: { runs: Run[]; width: number }[] = [];
    let current: Run[] = [];
    let currentWidth = 0;
    words.forEach((word, index) => {
      const runWidth = ctx.measureText(word.word).width;
      const nextWidth = currentWidth + (current.length > 0 ? spaceWidth : 0) + runWidth;
      if (current.length > 0 && nextWidth > w) {
        lines.push({ runs: current, width: currentWidth });
        current = [];
        currentWidth = 0;
      }
      if (current.length > 0) currentWidth += spaceWidth;
      current.push({ text: word.word, index, width: runWidth });
      currentWidth += runWidth;
    });
    if (current.length > 0) lines.push({ runs: current, width: currentWidth });

    const lineHeight = fontSize * 1.25;
    const totalHeight = lines.length * lineHeight;
    let y = h / 2 - totalHeight / 2 + lineHeight / 2;

    for (const line of lines) {
      let x = align === "left" ? 0 : align === "right" ? w - line.width : (w - line.width) / 2;
      for (const run of line.runs) {
        const isActive = run.index === activeWordIndex;
        ctx.fillStyle = isActive ? highlightColor : color;
        ctx.globalAlpha = animation === "word_pop" && activeWordIndex >= 0 && run.index > activeWordIndex ? 0.45 : 1;
        ctx.fillText(run.text, x, y);
        x += run.width + spaceWidth;
      }
      ctx.globalAlpha = 1;
      y += lineHeight;
    }

    return this.uploadCanvasTexture();
  }

  private render(content: string, style: Record<string, unknown>, widthPx: number, heightPx: number): WebGLTexture {
    const w = Math.max(2, Math.round(widthPx));
    const h = Math.max(2, Math.round(heightPx));
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    const fontSize = typeof style.fontSize === "number" ? style.fontSize : Math.round(h * 0.6);
    const fontWeight = typeof style.fontWeight === "number" || typeof style.fontWeight === "string" ? style.fontWeight : 600;
    const fontFamily = typeof style.fontFamily === "string" ? style.fontFamily : "system-ui, sans-serif";
    const color = typeof style.color === "string" ? style.color : "#ffffff";
    const align = (typeof style.align === "string" ? style.align : "center") as CanvasTextAlign;
    const strokeColor = typeof style.strokeColor === "string" ? style.strokeColor : undefined;
    const strokeWidth = typeof style.strokeWidth === "number" ? style.strokeWidth : 0;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;

    const x = align === "left" ? 0 : align === "right" ? w : w / 2;
    const lines = wrapText(ctx, content, w);
    const lineHeight = fontSize * 1.25;
    const totalHeight = lines.length * lineHeight;
    let y = h / 2 - totalHeight / 2 + lineHeight / 2;

    for (const line of lines) {
      if (strokeColor && strokeWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(line, x, y);
      }
      ctx.fillText(line, x, y);
      y += lineHeight;
    }

    return this.uploadCanvasTexture();
  }

  /** Evicts textures not used in the last N frames — call once per frame. */
  evictStale(maxAgeFrames = 300): void {
    for (const [key, entry] of this.entries) {
      if (this.frameCounter - entry.lastUsedFrame > maxAgeFrames) {
        this.gl.deleteTexture(entry.texture);
        this.entries.delete(key);
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.gl.deleteTexture(entry.texture);
    this.entries.clear();
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}
