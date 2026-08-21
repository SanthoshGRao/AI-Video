/**
 * text-style.ts — THE shared text model.
 *
 * Before this module the app had six independent text implementations, each
 * with its own idea of how a stored style becomes pixels:
 *
 *   1. content-studio subtitle panel preview      (DOM/CSS)
 *   2. editor-v2 canvas-stage preview             (DOM/CSS)
 *   3. desktop editor-renderer TextTextureCache   (Canvas2D -> GL)
 *   4. desktop export subtitles.ts                (ASS / libass)
 *   5. web export lib/engine/compositor.ts        (Canvas2D)
 *   6. web lib/subtitles/ass-export.ts            (ASS, again)
 *
 * They disagreed about nearly everything — most damagingly about the
 * authoring scale: (1) and (2) multiply the stored fontSize by
 * STUDIO_*_TEXT_SCALE against a 480px-tall authoring stage, while (3) and (4)
 * used the raw number, so exported captions came out roughly a third of
 * their on-screen size.
 *
 * This module owns that conversion once. `resolveTextStyle()` turns a stored
 * style + a target canvas height into fully concrete device pixels, and
 * text-renderer.ts rasterises it. Preview and export both go through the
 * pair, so "what you see is what you get" holds by construction rather than
 * by two implementations being kept in agreement by hand.
 */
import { STUDIO_PREVIEW_STAGE_H } from "@/lib/subtitles/presets";
import {
  STUDIO_SUBTITLE_TEXT_SCALE,
  STUDIO_TITLE_TEXT_SCALE,
} from "@/lib/subtitles/studio-overlay-styles";

/** Which authoring scale applies. Subtitles and titles were authored against
 * different preview scales (0.55 vs 0.34) and that difference is real user
 * intent, not an accident — it has to survive into every renderer. */
export type TextKind = "subtitle" | "title";

/** A stored text style, exactly as it appears on a timeline clip's
 * `properties.style` / an editor-v2 StageElement. Every field optional:
 * this is the *stored* shape, and defaults belong in resolveTextStyle(). */
export interface StoredTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  italic?: boolean;
  fontStyle?: string;
  underline?: boolean;
  textDecoration?: string;
  color?: string;
  /** 0-100 (editor convention), not 0-1. */
  opacity?: number;
  backgroundColor?: string;
  stroke?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  shadow?: boolean | string;
  textShadow?: string;
  letterSpacing?: number;
  lineHeight?: number;
  align?: string;
  /** Word-level highlight colour for karaoke/highlight/word_pop animations. */
  highlightColor?: string;
  animation?: string;
}

/** Fully concrete, ready to rasterise. Every length is device pixels on the
 * target canvas; every colour is a CSS colour string. No renderer that
 * consumes this needs to know about authoring scales or defaults. */
export interface ResolvedTextStyle {
  fontFamily: string;
  /** Single family name with quotes/fallbacks stripped — for consumers (ASS,
   * font file lookup) that cannot take a CSS font-family list. */
  primaryFamily: string;
  fontSizePx: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  color: string;
  opacity: number;
  backgroundColor: string | null;
  strokeColor: string | null;
  strokeWidthPx: number;
  shadow: { offsetX: number; offsetY: number; blur: number; color: string } | null;
  letterSpacingPx: number;
  lineHeightPx: number;
  align: "left" | "center" | "right";
  highlightColor: string | null;
  animation: string;
  /** Padding inside the text's box, matching the DOM preview's box padding
   * (studioSubtitleBoxStyle / studioTitleBoxStyle: 8px vertical, 12px
   * horizontal on the 300x480 authoring stage). */
  paddingXPx: number;
  paddingYPx: number;
  borderRadiusPx: number;
}

const DEFAULTS = {
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 30,
  fontWeight: 700,
  color: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: 2,
  highlightColor: "#fbbf24",
  lineHeightRatio: 1.375,
} as const;

/** The DOM preview's box padding/radius, in authoring-stage units. */
const BOX_PADDING_X = 12;
const BOX_PADDING_Y = 8;
const BOX_RADIUS = { subtitle: 8, title: 12 } as const;

export function textScaleFor(kind: TextKind): number {
  return kind === "subtitle" ? STUDIO_SUBTITLE_TEXT_SCALE : STUDIO_TITLE_TEXT_SCALE;
}

/**
 * The single conversion from authoring units to device pixels.
 *
 * `canvasHeight` is the height of whatever surface is being drawn to — the
 * on-screen stage for the preview, the export canvas for the export. Both
 * divide by the same 480px authoring stage, so a 1080x1920 export is exactly
 * a 4x scale-up of a 480px-tall preview and the two match proportionally.
 */
export function authoringToDevicePx(value: number, kind: TextKind, canvasHeight: number): number {
  return value * textScaleFor(kind) * (canvasHeight / STUDIO_PREVIEW_STAGE_H);
}

/** Strips a CSS font-family list down to its first real family name.
 * ffmpeg/libass and any file-based font lookup need one name, not a list —
 * passing `"Playfair Display, serif"` verbatim matched nothing and silently
 * fell back to a default font in the exported video. */
export function primaryFontFamily(family: string | undefined, fallback = "Inter"): string {
  if (!family) return fallback;
  const first = family.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return first || fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Parses a CSS `text-shadow` string well enough to reproduce the preview's
 * shadow. Only the `Xpx Ypx Blurpx color` form the studio styles emit is
 * supported; anything else falls back to the same soft drop shadow the DOM
 * preview uses for `shadow: true`. */
function parseShadow(
  style: StoredTextStyle,
  scale: number,
): ResolvedTextStyle["shadow"] {
  const raw = typeof style.textShadow === "string" ? style.textShadow : undefined;
  if (raw && raw !== "none") {
    const m = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(.+)$/.exec(raw.trim());
    if (m) {
      return {
        offsetX: parseFloat(m[1]) * scale,
        offsetY: parseFloat(m[2]) * scale,
        blur: parseFloat(m[3]) * scale,
        color: m[4].trim(),
      };
    }
  }
  const on = style.shadow === true || (typeof style.shadow === "string" && style.shadow !== "none") || !!raw;
  // Matches studioSubtitleTextStyle's `0 2px 8px rgba(0,0,0,0.6)`.
  return on ? { offsetX: 0, offsetY: 2 * scale, blur: 8 * scale, color: "rgba(0,0,0,0.6)" } : null;
}

/**
 * Resolves a stored style for a specific target canvas.
 *
 * Nothing here invents a colour the user did not pick: `color` falls back to
 * white only when the stored style has none at all. There is deliberately no
 * theme/accent default anywhere in this path — a renderer substituting its
 * own colour is exactly the class of bug that made captions render in a
 * colour the user never chose.
 */
export function resolveTextStyle(
  style: StoredTextStyle | null | undefined,
  kind: TextKind,
  canvasHeight: number,
): ResolvedTextStyle {
  const s = style ?? {};
  const scale = textScaleFor(kind) * (canvasHeight / STUDIO_PREVIEW_STAGE_H);
  // Box padding is not text — it scales with the stage, not with the text
  // scale, exactly as the DOM preview's `studio*BoxStyle` does.
  const boxScale = canvasHeight / STUDIO_PREVIEW_STAGE_H;

  const fontSizePx = num(s.fontSize, DEFAULTS.fontSize) * scale;
  const fontWeight =
    typeof s.fontWeight === "number"
      ? s.fontWeight
      : s.fontWeight === "bold"
        ? 700
        : Number(s.fontWeight) || DEFAULTS.fontWeight;

  const hasBackground =
    typeof s.backgroundColor === "string" &&
    s.backgroundColor !== "transparent" &&
    !/rgba\([^)]*,\s*0\s*\)$/.test(s.backgroundColor);

  return {
    fontFamily: s.fontFamily || DEFAULTS.fontFamily,
    primaryFamily: primaryFontFamily(s.fontFamily),
    fontSizePx,
    fontWeight,
    italic: s.italic === true || s.fontStyle === "italic",
    underline: s.underline === true || s.textDecoration === "underline",
    color: s.color || DEFAULTS.color,
    opacity: typeof s.opacity === "number" ? Math.max(0, Math.min(1, s.opacity / 100)) : 1,
    backgroundColor: hasBackground ? s.backgroundColor! : null,
    strokeColor: s.stroke ? s.strokeColor || DEFAULTS.strokeColor : null,
    strokeWidthPx: s.stroke ? num(s.strokeWidth, DEFAULTS.strokeWidth) * scale : 0,
    shadow: parseShadow(s, scale),
    letterSpacingPx: num(s.letterSpacing, 0) * scale,
    lineHeightPx: fontSizePx * num(s.lineHeight, DEFAULTS.lineHeightRatio),
    align: s.align === "left" || s.align === "right" ? s.align : "center",
    highlightColor: s.highlightColor || DEFAULTS.highlightColor,
    animation: s.animation || "none",
    paddingXPx: BOX_PADDING_X * boxScale,
    paddingYPx: BOX_PADDING_Y * boxScale,
    borderRadiusPx: BOX_RADIUS[kind] * boxScale,
  };
}

/** The CSS `font` shorthand for a resolved style. Quoting the family matters:
 * an unquoted multi-word family (e.g. `Bebas Neue`) can silently fail to
 * parse in a canvas `font` string and drop to the default font. */
export function cssFontString(rs: ResolvedTextStyle): string {
  const families = rs.fontFamily
    .split(",")
    .map((f) => {
      const name = f.trim().replace(/^['"]|['"]$/g, "");
      return /^[a-z-]+$/i.test(name) ? name : `"${name}"`;
    })
    .join(", ");
  return `${rs.italic ? "italic " : ""}${rs.fontWeight} ${rs.fontSizePx}px ${families}`;
}
