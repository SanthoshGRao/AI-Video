import type { CSSProperties } from "react";
import type { SubtitleStyle } from "./types";
import type { TitleStyleLike } from "./presets";
import { STUDIO_PREVIEW_STAGE_H } from "./presets";

export const STUDIO_PREVIEW_WIDTH = 300;

export const STUDIO_SUBTITLE_TEXT_SCALE = 0.55;
export const STUDIO_TITLE_TEXT_SCALE = 0.34;

/** Subtitle overlay insets from Subtitles tab (left-3 right-3 bottom-12 on 300×480 preview). */
export const STUDIO_SUBTITLE_INSETS = { left: 12, right: 12, bottom: 48 };
/** Title overlay insets (left-4 right-4 top-10). */
export const STUDIO_TITLE_INSETS = { left: 16, right: 16, top: 40 };

export function studioScaleFromStage(stageW: number, stageH: number) {
  return {
    scaleW: stageW / STUDIO_PREVIEW_WIDTH,
    scaleH: stageH / STUDIO_PREVIEW_STAGE_H,
  };
}

export function studioFontSizePx(
  fontSize: number,
  kind: "subtitle" | "title",
  scaleH = 1,
): number {
  const textScale = kind === "subtitle" ? STUDIO_SUBTITLE_TEXT_SCALE : STUDIO_TITLE_TEXT_SCALE;
  return fontSize * textScale * scaleH;
}

export function studioStrokePx(
  strokeWidth: number,
  kind: "subtitle" | "title",
  scaleH = 1,
): number {
  const textScale = kind === "subtitle" ? STUDIO_SUBTITLE_TEXT_SCALE : STUDIO_TITLE_TEXT_SCALE;
  return strokeWidth * textScale * scaleH;
}

export function studioSubtitleInsetStyle(
  scaleW = 1,
  scaleH = 1,
): CSSProperties {
  return {
    position: "absolute",
    left: STUDIO_SUBTITLE_INSETS.left * scaleW,
    right: STUDIO_SUBTITLE_INSETS.right * scaleW,
    bottom: STUDIO_SUBTITLE_INSETS.bottom * scaleH,
    top: "auto",
    width: "auto",
    height: "auto",
  };
}

export function studioTitleInsetStyle(scaleW = 1, scaleH = 1): CSSProperties {
  return {
    position: "absolute",
    left: STUDIO_TITLE_INSETS.left * scaleW,
    right: STUDIO_TITLE_INSETS.right * scaleW,
    top: STUDIO_TITLE_INSETS.top * scaleH,
    bottom: "auto",
    width: "auto",
    height: "auto",
  };
}

export function studioSubtitleBoxStyle(scaleW = 1, scaleH = 1): CSSProperties {
  return {
    padding: `${8 * scaleH}px ${12 * scaleW}px`,
    borderRadius: 8 * scaleH,
    textAlign: "center",
    lineHeight: 1.375,
  };
}

export function studioTitleBoxStyle(scaleW = 1, scaleH = 1): CSSProperties {
  return {
    padding: `${8 * scaleH}px ${12 * scaleW}px`,
    borderRadius: 12 * scaleH,
    textAlign: "center",
    lineHeight: 1.25,
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
  };
}

export function studioSubtitleTextStyle(
  ss: SubtitleStyle,
  scaleH = 1,
): CSSProperties {
  const hasBg = ss.backgroundColor && ss.backgroundColor !== "transparent";
  return {
    fontFamily: ss.fontFamily,
    fontSize: studioFontSizePx(ss.fontSize, "subtitle", scaleH),
    fontWeight: ss.fontWeight,
    fontStyle: ss.fontStyle === "italic" ? "italic" : "normal",
    color: ss.color,
    backgroundColor: hasBg ? ss.backgroundColor : undefined,
    textShadow: ss.shadow ? "0 2px 8px rgba(0,0,0,0.6)" : undefined,
    WebkitTextStroke: ss.stroke
      ? `${studioStrokePx(ss.strokeWidth, "subtitle", scaleH)}px ${ss.strokeColor}`
      : undefined,
    paintOrder: "stroke fill",
  };
}

export function studioTitleTextStyle(
  ts: TitleStyleLike,
  scaleH = 1,
): CSSProperties {
  const bgOpacity = typeof ts.backgroundOpacity === "number" ? ts.backgroundOpacity : 0;
  return {
    fontFamily: ts.fontFamily || "Montserrat, sans-serif",
    fontSize: studioFontSizePx(ts.fontSize || 56, "title", scaleH),
    fontWeight: ts.fontWeight || 800,
    fontStyle: ts.fontStyle === "italic" ? "italic" : "normal",
    textDecoration: ts.textDecoration === "underline" ? "underline" : "none",
    letterSpacing: (ts.letterSpacing ?? 0) * scaleH,
    color: ts.color || "#ffffff",
    backgroundColor: bgOpacity > 0 ? `rgba(0,0,0,${bgOpacity / 100})` : undefined,
    textShadow: ts.shadow !== false ? "0 2px 8px rgba(0,0,0,0.65)" : "none",
  };
}
