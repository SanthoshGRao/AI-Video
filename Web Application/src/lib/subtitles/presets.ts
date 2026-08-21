import type { SubtitleStyle } from "@/lib/subtitles/types";

/** Fact category labels used when building titles from extractedFacts objects. */
export const TITLE_FACT_CATEGORY_LABELS: Record<string, string> = {
  location: "Location",
  plotSize: "Plot Size",
  price: "Price",
  priceUnit: "Price Unit",
  roadAccess: "Road Access",
  water: "Water",
  electricity: "Electricity",
  legal: "Legal",
  plantation: "Plantation",
  irrigation: "Irrigation",
  propertyType: "Property Type",
  distances: "Distance",
  nearbyLandmarks: "Landmark",
  additionalFeatures: "Feature",
  highlights: "Highlight",
};

/** Remove stored prefixes like "Legal: Clear title" → "Clear title". */
export function stripFactCategoryPrefix(text: string): string {
  const trimmed = text.trim();
  for (const label of Object.values(TITLE_FACT_CATEGORY_LABELS)) {
    const prefix = `${label}: `;
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return trimmed;
}

/** Subtitles / Titles tab preview height — editor text scales to match this reference. */
export const STUDIO_PREVIEW_STAGE_H = 480;

/** Google Fonts recommended for subtitles — loaded in layout.tsx */
export const RECOMMENDED_FONTS = [
  { family: "Inter", label: "Inter", weights: [400, 600, 700, 800] },
  { family: "Montserrat", label: "Montserrat", weights: [400, 600, 700, 800, 900] },
  { family: "Poppins", label: "Poppins", weights: [400, 500, 600, 700, 800] },
  { family: "Roboto", label: "Roboto", weights: [400, 500, 700, 900] },
  { family: "Oswald", label: "Oswald", weights: [400, 500, 600, 700] },
  { family: "Bebas Neue", label: "Bebas Neue", weights: [400] },
  { family: "Playfair Display", label: "Playfair Display", weights: [400, 600, 700, 800, 900] },
  { family: "Outfit", label: "Outfit", weights: [400, 500, 600, 700, 800] },
  { family: "Lato", label: "Lato", weights: [400, 700, 900] },
  { family: "Raleway", label: "Raleway", weights: [400, 500, 600, 700, 800] },
] as const;

export const SUBTITLE_STYLE_PRESETS: Record<string, SubtitleStyle> = {
  instagram_reels: {
    fontFamily: "Montserrat, sans-serif",
    fontStyle: "italic",
    fontSize: 34,
    fontWeight: 900,
    color: "#ffffff",
    backgroundColor: "transparent",
    position: "center",
    animation: "word_pop",
    highlightColor: "#f97316",
    stroke: true,
    strokeColor: "#000000",
    strokeWidth: 3,
    shadow: true,
  },
  youtube_shorts: {
    fontFamily: "Roboto, sans-serif",
    fontSize: 26,
    fontWeight: 700,
    color: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.7)",
    position: "bottom",
    animation: "highlight",
    highlightColor: "#22c55e",
    stroke: false,
    strokeColor: "#000000",
    strokeWidth: 0,
    shadow: true,
  },
  minimal: {
    fontFamily: "system-ui, sans-serif",
    fontSize: 24,
    fontWeight: 600,
    color: "#ffffff",
    backgroundColor: "transparent",
    position: "bottom",
    animation: "none",
    highlightColor: "#ffffff",
    stroke: true,
    strokeColor: "#000000",
    strokeWidth: 3,
    shadow: false,
  },
  karaoke: {
    fontFamily: "Inter, sans-serif",
    fontSize: 30,
    fontWeight: 800,
    color: "#e0e7ff",
    backgroundColor: "rgba(49,46,129,0.75)",
    position: "center",
    animation: "karaoke",
    highlightColor: "#a5b4fc",
    stroke: true,
    strokeColor: "#1e1b4b",
    strokeWidth: 2,
    shadow: true,
  },
  bold_montserrat: {
    fontFamily: "Montserrat, sans-serif",
    fontSize: 30,
    fontWeight: 800,
    color: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.6)",
    position: "bottom",
    animation: "word_pop",
    highlightColor: "#f59e0b",
    stroke: true,
    strokeColor: "#000000",
    strokeWidth: 2,
    shadow: true,
  },
  elegant_playfair: {
    fontFamily: "Playfair Display, serif",
    fontSize: 26,
    fontWeight: 700,
    color: "#fef3c7",
    backgroundColor: "rgba(15,23,42,0.7)",
    position: "bottom",
    animation: "fade",
    highlightColor: "#fbbf24",
    stroke: false,
    strokeColor: "#000000",
    strokeWidth: 0,
    shadow: true,
  },
  cinematic_bebas: {
    fontFamily: "Bebas Neue, sans-serif",
    fontSize: 34,
    fontWeight: 400,
    color: "#ffffff",
    backgroundColor: "transparent",
    position: "bottom",
    animation: "word_pop",
    highlightColor: "#ef4444",
    stroke: true,
    strokeColor: "#000000",
    strokeWidth: 3,
    shadow: true,
  },
  modern_poppins: {
    fontFamily: "Poppins, sans-serif",
    fontSize: 26,
    fontWeight: 600,
    color: "#ffffff",
    backgroundColor: "rgba(99,102,241,0.6)",
    position: "bottom",
    animation: "highlight",
    highlightColor: "#c4b5fd",
    stroke: false,
    strokeColor: "#000000",
    strokeWidth: 0,
    shadow: true,
  },
};

export function resolveSubtitleStyle(
  preset: string,
  custom: SubtitleStyle | null
): SubtitleStyle {
  const presetName = SUBTITLE_STYLE_PRESETS[preset] ? preset : "instagram_reels";
  const base = SUBTITLE_STYLE_PRESETS[presetName] ?? SUBTITLE_STYLE_PRESETS.instagram_reels;
  if (!custom) return { ...base, position: "bottom" };

  const resolved = { ...base, ...custom };

  // Compatibility cleanup: older editor saves stored a full Karaoke customStyle
  // even when the user had not explicitly selected the Karaoke preset.
  if (presetName !== "karaoke" && custom.animation === "karaoke") {
    resolved.animation = base.animation;
    resolved.highlightColor = base.highlightColor;
  }

  return { ...resolved, position: "bottom" };
}

/** Map resolved subtitle style to editor-v2 stage fields (matches Subtitles tab preview). */
export function mapSubtitleStyleToStage(ss: SubtitleStyle) {
  const pos = ss.position;
  const hasBg = ss.backgroundColor && ss.backgroundColor !== "transparent";
  const rawFont = ss.fontFamily || "Inter, system-ui, sans-serif";
  const cleanFont = rawFont.split(",")[0].trim().replace(/['"]/g, "");

  return {
    x: 10,
    y: pos === "top" ? 15 : pos === "center" ? 45 : 75,
    w: 80,
    h: 20,
    color: ss.color,
    fontSize: ss.fontSize,
    fontWeight: ss.fontWeight,
    fontFamily: cleanFont,
    italic: ss.fontStyle === "italic",
    underline: false,
    letterSpacing: 0,
    backgroundColor: hasBg ? ss.backgroundColor : undefined,
    backgroundOpacity: undefined,
    stroke: ss.stroke,
    strokeColor: ss.strokeColor,
    strokeWidth: ss.strokeWidth,
    shadow: ss.shadow,
    highlightColor: ss.highlightColor,
    animation: ss.animation || "none",
    align: "center" as const,
    studioOverlay: "subtitle" as const,
  };
}

export type TitleStyleLike = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  backgroundOpacity?: number;
  fontStyle?: "normal" | "italic" | string;
  textDecoration?: "none" | "underline" | string;
  letterSpacing?: number;
  shadow?: boolean;
  position?: "top" | "middle" | "bottom" | string;
};

/** Map title card style to editor-v2 stage fields (matches Titles tab preview). */
export function mapTitleStyleToStage(ts: TitleStyleLike) {
  const bgOpacity = typeof ts.backgroundOpacity === "number" ? ts.backgroundOpacity : 0;
  const pos = ts.position ?? "top";
  const rawFont = ts.fontFamily || "Montserrat, sans-serif";
  const cleanFont = rawFont.split(",")[0].trim().replace(/['"]/g, "");

  return {
    x: 10,
    y: pos === "bottom" ? 75 : pos === "middle" ? 42 : 8,
    w: 80,
    h: 16,
    color: ts.color || "#ffffff",
    fontSize: ts.fontSize || 56,
    fontWeight: ts.fontWeight || 800,
    fontFamily: cleanFont,
    italic: ts.fontStyle === "italic",
    underline: ts.textDecoration === "underline",
    letterSpacing: ts.letterSpacing ?? 0,
    backgroundColor: bgOpacity > 0 ? `rgba(0,0,0,${bgOpacity / 100})` : undefined,
    backgroundOpacity: undefined,
    stroke: false,
    shadow: ts.shadow !== false,
    align: "center" as const,
    studioOverlay: "title" as const,
  };
}

export function resolveTitleStyle(
  preset: string,
  custom: SubtitleStyle | null
): SubtitleStyle {
  const style = resolveSubtitleStyle(preset, custom);
  return { ...style, position: "top" };
}
