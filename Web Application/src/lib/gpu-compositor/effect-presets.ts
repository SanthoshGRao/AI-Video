import type {
  ColorAdjustParams,
  EffectId,
  EffectStep,
} from "./types";

const NEUTRAL_COLOR_ADJUST: ColorAdjustParams = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hueDeg: 0,
  sepia: 0,
  invert: 0,
};

function colorAdjust(overrides: Partial<ColorAdjustParams>): EffectStep {
  return { id: "none", colorAdjust: { ...NEUTRAL_COLOR_ADJUST, ...overrides } };
}

/**
 * Named presets mirror `EFFECT_FILTERS` in `lib/engine/compositor.ts`
 * (the current canvas2D/CSS-filter export path) so switching a clip's
 * `effect` id to the GPU compositor produces the same look:
 *   none/grayscale/sepia/blur/vintage/vivid/cool/warm/invert.
 */
const NAMED_PRESETS: Partial<Record<EffectId, EffectStep>> = {
  none: colorAdjust({}),
  grayscale: colorAdjust({ saturation: 0 }),
  sepia: colorAdjust({ sepia: 0.85 }),
  blur: { id: "blur", blur: { radiusPx: 3 } },
  vintage: colorAdjust({ sepia: 0.4, contrast: 1.1, saturation: 1.3 }),
  vivid: colorAdjust({ saturation: 1.8, contrast: 1.15 }),
  cool: colorAdjust({ hueDeg: -15, saturation: 1.2, brightness: 1.05 }),
  warm: colorAdjust({ hueDeg: 15, saturation: 1.3, brightness: 1.05 }),
  invert: colorAdjust({ invert: 1 }),
};

/** Resolves a named/legacy effect id (grayscale, vintage, …) to its shader step. */
export function presetEffectStep(id: EffectId): EffectStep {
  const preset = NAMED_PRESETS[id];
  if (preset) return preset;
  // brightness/contrast/saturation/hue/lut/chromaKey/glow/vignette are
  // parameterized directly by the caller (see below) rather than having a
  // single fixed preset value — fall back to neutral if used unparameterized.
  return colorAdjust({});
}

export function brightnessEffect(amount: number): EffectStep {
  return colorAdjust({ brightness: amount });
}

export function contrastEffect(amount: number): EffectStep {
  return colorAdjust({ contrast: amount });
}

export function saturationEffect(amount: number): EffectStep {
  return colorAdjust({ saturation: amount });
}

export function hueEffect(degrees: number): EffectStep {
  return colorAdjust({ hueDeg: degrees });
}

export function blurEffect(radiusPx: number): EffectStep {
  return { id: "blur", blur: { radiusPx } };
}

export function vignetteEffect(strength: number): EffectStep {
  return { id: "vignette", vignette: { strength } };
}

export function chromaKeyEffect(
  keyColor: [number, number, number],
  similarity = 0.4,
  smoothness = 0.1,
): EffectStep {
  return { id: "chromaKey", chromaKey: { keyColor, similarity, smoothness } };
}

export function glowEffect(threshold = 0.7, radiusPx = 6, intensity = 0.6): EffectStep {
  return { id: "glow", glow: { threshold, radiusPx, intensity } };
}

export function lutEffect(source: TexImageSource, size: number): EffectStep {
  return { id: "lut", lut: { source, size } };
}

/** A no-op color-adjust step — used when a layer has no effect at all. */
export const NO_EFFECT: EffectStep = colorAdjust({});
