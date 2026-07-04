import { assetRegistry } from "./asset-registry";
import { seekVideoForExport } from "./seek-video";
import type { RenderTrackItem } from "@/lib/editor/render-types";

/**
 * Editor preview reference height (see canvas-stage.tsx BASE_STAGE_H /
 * STUDIO_PREVIEW_STAGE_H). Authored font sizes are relative to this stage, so
 * the export must scale them by (canvasHeight / REF_STAGE_H) to look identical.
 */
const REF_STAGE_H = 480;
/** Matches STUDIO_TITLE_TEXT_SCALE — how the editor down-scales title/text fonts. */
const TITLE_TEXT_SCALE = 0.34;

/** CSS filter string for an editor effect id — mirrors editor-data EFFECTS. */
const EFFECT_FILTERS: Record<string, string> = {
  none: "none",
  grayscale: "grayscale(1)",
  sepia: "sepia(0.85)",
  blur: "blur(3px)",
  vintage: "sepia(0.4) contrast(1.1) saturate(1.3)",
  vivid: "saturate(1.8) contrast(1.15)",
  cool: "hue-rotate(-15deg) saturate(1.2) brightness(1.05)",
  warm: "hue-rotate(15deg) saturate(1.3) brightness(1.05)",
  invert: "invert(1)",
};

/**
 * Build a canvas `font` string with the family safely quoted and a generic
 * fallback. Unquoted multi-word families (e.g. `Bebas Neue`) can silently fail
 * to parse in some canvas engines, dropping the whole font to the default.
 */
function cssFont(
  fontStyle: string,
  fontWeight: string | number,
  fontSizePx: number,
  family: string,
): string {
  const fam = String(family || "sans-serif").replace(/["']/g, "").trim();
  const style = fontStyle ? `${fontStyle} ` : "";
  return `${style}${fontWeight} ${fontSizePx}px "${fam}", sans-serif`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export class Compositor {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number
  ) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  public setDimensions(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  public async renderFrame(
    timeMs: number,
    activeItems: RenderTrackItem[],
    background: { type: string; value: string }
  ) {
    // 1. Clear and draw background
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    if (background.type === "color") {
      this.ctx.fillStyle = background.value || "#000000";
      this.ctx.fillRect(0, 0, this.width, this.height);
    } else if (background.type === "image" && background.value) {
      // Background image not fully implemented here yet
      this.ctx.fillStyle = "#000000";
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // 2. Sort items by z-index/track
    // Assuming activeItems are already ordered or we can order them here.
    // Track order dictates z-index (bottom to top).
    // Let's assume they are already sorted by the caller based on track structure.

    // 3. Draw each item (caller must pass bottom-to-top track order)
    for (const item of activeItems) {
      if (item.type === "audio") continue;

      this.ctx.save();

      const { details } = item;
      if (!details) {
        this.ctx.restore();
        continue;
      }

      const left = parseFloat(String(details.left ?? "0").replace(/px$/, ""));
      const top = parseFloat(String(details.top ?? "0").replace(/px$/, ""));
      const width = parseFloat(String(details.width ?? "0").replace(/px$/, ""));
      const height = parseFloat(String(details.height ?? "0").replace(/px$/, ""));
      const rotation = parseFloat(String(details.rotation ?? details.rotate ?? "0").replace(/deg$/, ""));
      const opacityRaw = details.opacity ?? 100;
      const opacity = (typeof opacityRaw === "number" ? opacityRaw : parseFloat(String(opacityRaw))) / 100;

      this.ctx.globalAlpha = opacity;

      const drawW = width > 0 ? width : this.width;
      const drawH = height > 0 ? height : this.height;
      const drawX = left;
      const drawY = top;

      const cx = drawX + drawW / 2;
      const cy = drawY + drawH / 2;

      this.ctx.translate(cx, cy);
      this.ctx.rotate((rotation * Math.PI) / 180);
      this.ctx.translate(-cx, -cy);

      if (item.type === "video" || item.type === "image") {
        const emoji = details.emoji as string | undefined;
        if (emoji) {
          try {
            const fontSize = drawH * 0.8;
            this.ctx.font = `${fontSize}px Arial`;
            this.ctx.fillStyle = "#ffffff";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(emoji, cx, cy);
          } catch (err) {
            console.warn("Failed to draw emoji sticker", err);
          }
        } else {
          const src = details.src;
          if (src) {
            const asset = assetRegistry.get(src);
            if (asset && (asset.type === "video" || asset.type === "image")) {
              try {
                // Apply the editor's visual effect (grayscale, blur, vintage, …).
                // Chromium's canvas honours ctx.filter for drawImage.
                const effectId = (details.effect as string | undefined) ?? "none";
                const filterCss = EFFECT_FILTERS[effectId] ?? "none";
                if (filterCss !== "none") {
                  (this.ctx as CanvasRenderingContext2D).filter = filterCss;
                }
                const mediaEl = asset.element as HTMLVideoElement | HTMLImageElement;
                if (asset.type === "video") {
                  const video = mediaEl as HTMLVideoElement;
                  const itemStart = item.display?.from ?? 0;
                  const trimStart = item.trim?.from ?? 0;
                  const playbackRate = (item as any).playbackRate ?? 1;
                  const mediaTimeSec = (trimStart + (timeMs - itemStart) * playbackRate) / 1000;
                  if (Number.isFinite(mediaTimeSec) && mediaTimeSec >= 0) {
                    await seekVideoForExport(video, mediaTimeSec);
                  }
                }
                const objectFit = (details as { objectFit?: string }).objectFit ?? "cover";
                const nw = asset.width ?? drawW;
                const nh = asset.height ?? drawH;
                if (objectFit === "contain") {
                  const scale = Math.min(drawW / nw, drawH / nh);
                  const sw = nw * scale;
                  const sh = nh * scale;
                  this.ctx.drawImage(
                    mediaEl,
                    drawX + (drawW - sw) / 2,
                    drawY + (drawH - sh) / 2,
                    sw,
                    sh,
                  );
                } else {
                  // "cover" mode: crop the source image/video to fill the destination box without distortion
                  const scale = Math.max(drawW / nw, drawH / nh);
                  const sw = drawW / scale;
                  const sh = drawH / scale;
                  const sx = (nw - sw) / 2;
                  const sy = (nh - sh) / 2;
                  this.ctx.drawImage(
                    mediaEl,
                    sx,
                    sy,
                    sw,
                    sh,
                    drawX,
                    drawY,
                    drawW,
                    drawH,
                  );
                }
              } catch (err) {
                console.warn("Failed to draw media", err);
              }
            }
          }
        }
      } else if (item.type === "shape" as any) {
        try {
          const shapeType = (details.shapeType as string) || "rect";
          const color = (details.color as string) || "#ffffff";
          this.drawShape(shapeType, color, drawX, drawY, drawW, drawH, cx, cy);
        } catch (err) {
          console.warn("Failed to draw custom shape", err);
        }
      } else if (
        item.type === "caption" &&
        Array.isArray(details.words) &&
        details.words.length > 0 &&
        ["karaoke", "highlight", "word_pop"].includes(String(details.animation ?? ""))
      ) {
        // Word-level highlight animations. Each caption item is already one
        // cue (see render-doc-adapter.ts), so `words` IS the group to render —
        // no re-chunking into arbitrary sentences is needed.
        const words: { word?: string; text?: string; start: number; end: number }[] = details.words;
        const animation = String(details.animation);
        const fontSize = parseFloat(details.fontSize || "48");
        const fontFamily = details.fontFamily || "Arial";
        const color = details.color || "#ffffff";
        const fontWeight = details.fontWeight || "normal";
        const strokeColor = (details.strokeColor as string) || (details.borderColor as string) || (details.WebkitTextStrokeColor as string);
        const strokeWidth = parseFloat(String(details.strokeWidth || details.borderWidth || details.WebkitTextStrokeWidth || "0"));

        this.ctx.font = cssFont("", fontWeight, fontSize, fontFamily);
        this.ctx.textBaseline = "middle";

        // Word timings are cue-relative; convert to absolute ms.
        const offsetFrom = (item.display?.from ?? 0) - (words[0]?.start ?? 0);
        const activeWordIndex = words.findIndex(
          (w) => timeMs >= w.start + offsetFrom && timeMs <= w.end + offsetFrom
        );

        // Wrap words to lines to fit within the item width bounds.
        const lines: { words: { index: number; text: string; width: number }[]; width: number }[] = [];
        let currentLineWords: { index: number; text: string; width: number }[] = [];
        let currentLineWidth = 0;
        const maxWidth = drawW > 0 ? drawW : this.width * 0.9;
        const gap = fontSize * 0.25;

        words.forEach((w, index) => {
          const wText = String(w.text || w.word || "");
          const wWidth = this.ctx.measureText(wText).width;
          if (currentLineWidth + wWidth > maxWidth && currentLineWords.length > 0) {
            lines.push({ words: currentLineWords, width: currentLineWidth - gap });
            currentLineWords = [];
            currentLineWidth = 0;
          }
          currentLineWords.push({ index, text: wText, width: wWidth });
          currentLineWidth += wWidth + gap;
        });
        if (currentLineWords.length > 0) {
          lines.push({ words: currentLineWords, width: currentLineWidth - gap });
        }

        // Draw wrapped lines centered vertically and horizontally.
        const lineHeight = fontSize * 1.2;
        const totalHeight = lines.length * lineHeight;
        let startY = drawY + drawH / 2 - totalHeight / 2 + lineHeight / 2;

        lines.forEach((line) => {
          let currentX = cx - line.width / 2;
          line.words.forEach(({ index, text: wText, width: wordWidth }) => {
            const isActive = index === activeWordIndex;
            // word_pop dims words the karaoke cursor hasn't reached yet, matching
            // the editor preview (canvas-stage.tsx); karaoke/highlight stay at
            // full opacity and only swap color on the active word.
            const dim = animation === "word_pop" && index > activeWordIndex;
            this.ctx.globalAlpha = opacity * (dim ? 0.45 : 1);

            this.ctx.fillStyle = isActive
              ? (details.activeColor as string) || (details.activeFillColor as string) || "#FFD700"
              : color;

            const drawWordX = currentX + wordWidth / 2;
            if (strokeColor && strokeWidth > 0) {
              this.ctx.strokeStyle = strokeColor;
              this.ctx.lineWidth = strokeWidth;
              this.ctx.strokeText(wText, drawWordX, startY);
            }

            this.ctx.textAlign = "center";
            this.ctx.fillText(wText, drawWordX, startY);

            currentX += wordWidth + gap;
          });
          startY += lineHeight;
        });
        this.ctx.globalAlpha = opacity;
      } else if (item.type === "text" || item.type === "caption") {
        const text = String(details.text || "");
        const rawFont = parseFloat(details.fontSize || "48");
        // Plain text (titles) is authored against the 480px editor stage and
        // down-scaled by 0.34 there; reproduce that so export text matches the
        // editor size. Captions arrive here already sized by the adapter.
        const fontSize =
          item.type === "caption"
            ? rawFont
            : rawFont * TITLE_TEXT_SCALE * (this.height / REF_STAGE_H);
        const fontFamily = details.fontFamily || "Arial";
        const color = details.color || "#ffffff";
        const textAlign = (details.textAlign || "center") as CanvasTextAlign;
        const fontWeight = details.fontWeight || "normal";
        const fontStyle = details.fontStyle === "italic" ? "italic " : "";
        const strokeColor =
          (details.strokeColor as string) ||
          (details.WebkitTextStrokeColor as string) ||
          (details.borderColor as string);
        const strokeWidth = parseFloat(
          String(details.strokeWidth || details.WebkitTextStrokeWidth || "0"),
        );
        const bg = details.backgroundColor as string | undefined;
        const underline =
          details.textDecoration === "underline" || details.underline === true;
        const fontScale = this.height / REF_STAGE_H;
        // Letter spacing is authored against the editor stage; scale it like the
        // font. Captions arrive pre-sized, so don't re-scale those.
        const rawLetterSpacing = parseFloat(String(details.letterSpacing ?? "0"));
        const letterSpacing = Number.isFinite(rawLetterSpacing)
          ? item.type === "caption"
            ? rawLetterSpacing
            : rawLetterSpacing * fontScale
          : 0;

        this.ctx.font = cssFont(fontStyle.trim(), fontWeight, fontSize, fontFamily);
        this.ctx.textBaseline = "middle";
        // Chromium canvas honours letterSpacing (and applies it to measureText).
        try {
          (this.ctx as CanvasRenderingContext2D).letterSpacing = `${letterSpacing}px`;
        } catch {
          /* older engine without letterSpacing support */
        }

        // Wrap text to the element box (the editor uses word-wrap), so long
        // lines don't overflow the frame edges.
        const maxWidth = drawW > 0 ? drawW - 8 : this.width * 0.9;
        const lines: string[] = [];
        for (const paragraph of text.split("\n")) {
          const words = paragraph.split(/\s+/).filter(Boolean);
          if (words.length === 0) {
            lines.push("");
            continue;
          }
          let line = words[0];
          for (let w = 1; w < words.length; w++) {
            const candidate = `${line} ${words[w]}`;
            if (this.ctx.measureText(candidate).width > maxWidth) {
              lines.push(line);
              line = words[w];
            } else {
              line = candidate;
            }
          }
          lines.push(line);
        }

        const lineHeight = fontSize * 1.25;
        const totalHeight = lines.length * lineHeight;

        // Background box behind the whole element (matches the editor's bg box).
        if (bg && bg !== "transparent") {
          this.ctx.save();
          this.ctx.fillStyle = bg;
          roundRectPath(this.ctx, drawX, drawY, drawW, drawH, Math.min(12, drawH / 2));
          this.ctx.fill();
          this.ctx.restore();
        }

        this.ctx.textAlign = textAlign;
        let drawTextX = cx;
        if (textAlign === "left") drawTextX = drawX + 4;
        if (textAlign === "right") drawTextX = drawX + drawW - 4;

        let startY = drawY + drawH / 2 - totalHeight / 2 + lineHeight / 2;
        for (const line of lines) {
          if (details.textShadow && details.textShadow !== "none") {
            this.ctx.save();
            this.ctx.shadowColor = "rgba(0,0,0,0.65)";
            this.ctx.shadowBlur = fontSize * 0.15;
            this.ctx.shadowOffsetY = fontSize * 0.04;
            this.ctx.fillStyle = color;
            this.ctx.fillText(line, drawTextX, startY);
            this.ctx.restore();
          }
          if (strokeColor && strokeWidth > 0) {
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = item.type === "caption" ? strokeWidth : strokeWidth * fontScale;
            this.ctx.lineJoin = "round";
            this.ctx.strokeText(line, drawTextX, startY);
          }
          this.ctx.fillStyle = color;
          this.ctx.fillText(line, drawTextX, startY);

          if (underline && line) {
            const lineW = this.ctx.measureText(line).width;
            const ux =
              textAlign === "left"
                ? drawTextX
                : textAlign === "right"
                  ? drawTextX - lineW
                  : drawTextX - lineW / 2;
            const uy = startY + fontSize * 0.42;
            this.ctx.save();
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = Math.max(1, fontSize * 0.06);
            this.ctx.beginPath();
            this.ctx.moveTo(ux, uy);
            this.ctx.lineTo(ux + lineW, uy);
            this.ctx.stroke();
            this.ctx.restore();
          }
          startY += lineHeight;
        }

        // Reset letter spacing so it doesn't leak into later items.
        try {
          (this.ctx as CanvasRenderingContext2D).letterSpacing = "0px";
        } catch {
          /* no-op */
        }
      }

      this.ctx.restore();
    }
  }

  private drawShape(
    shapeType: string,
    color: string,
    left: number,
    top: number,
    width: number,
    height: number,
    cx: number,
    cy: number
  ) {
    this.ctx.fillStyle = color || "#ffffff";
    this.ctx.strokeStyle = color || "#ffffff";

    if (shapeType === "rect" || shapeType === "rectangle") {
      this.ctx.fillRect(left, top, width, height);
    } else if (shapeType === "ellipse" || shapeType === "circle") {
      this.ctx.beginPath();
      this.ctx.ellipse(cx, cy, width / 2, height / 2, 0, 0, 2 * Math.PI);
      this.ctx.fill();
    } else if (shapeType === "triangle") {
      this.ctx.beginPath();
      this.ctx.moveTo(cx, top);
      this.ctx.lineTo(left + width, top + height);
      this.ctx.lineTo(left, top + height);
      this.ctx.closePath();
      this.ctx.fill();
    } else if (shapeType === "line") {
      this.ctx.beginPath();
      this.ctx.lineWidth = height > 0 ? height : 6;
      this.ctx.lineCap = "round";
      this.ctx.moveTo(left, cy);
      this.ctx.lineTo(left + width, cy);
      this.ctx.stroke();
    } else {
      this.ctx.save();
      this.ctx.translate(left, top);
      this.ctx.scale(width / 100, height / 100);

      let pathStr = "";
      if (shapeType === "cloud") {
        pathStr = "M 25,60 A 20,20 0 0,1 45,40 A 25,25 0 0,1 85,45 A 20,20 0 0,1 85,85 H 25 A 20,20 0 0,1 25,60 Z";
      } else if (shapeType === "star") {
        pathStr = "M 50,5 L 64,36 L 98,36 L 70,57 L 81,91 L 50,70 L 19,91 L 30,57 L 2,36 L 36,36 Z";
      } else if (shapeType === "arrow" || shapeType === "rightArrow") {
        pathStr = "M 10,35 L 60,35 L 60,15 L 90,50 L 60,85 L 60,65 L 10,65 Z";
      } else if (shapeType === "pentagon") {
        pathStr = "M 50,5 L 95,38 L 78,92 L 22,92 L 5,38 Z";
      } else if (shapeType === "hexagon") {
        pathStr = "M 50,5 L 90,28 L 90,72 L 50,95 L 10,72 L 10,28 Z";
      } else if (shapeType === "heart") {
        pathStr = "M 50,30 C 50,30 50,15 35,15 C 18,15 18,37 18,37 C 18,58 50,82 50,85 C 50,82 82,58 82,37 C 82,37 82,15 65,15 C 50,15 50,30 50,30 Z";
      } else if (shapeType === "bubble" || shapeType === "speechBubble") {
        pathStr = "M 10,15 h 80 v 50 H 55 L 35,85 V 65 H 10 Z";
      }

      if (pathStr) {
        const path = new Path2D(pathStr);
        this.ctx.fill(path);
      }
      this.ctx.restore();
    }
  }
}
