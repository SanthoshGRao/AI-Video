/** GPU compositor core — shared types. See gpu-compositor/README-less design notes in compositor.ts. */

export type EffectId =
  | "none"
  | "grayscale"
  | "sepia"
  | "blur"
  | "vintage"
  | "vivid"
  | "cool"
  | "warm"
  | "invert"
  | "brightness"
  | "contrast"
  | "saturation"
  | "hue"
  | "lut"
  | "chromaKey"
  | "glow"
  | "vignette";

/** Parameters for the unified color-adjust pass (grayscale/sepia/vintage/vivid/cool/warm/invert
 * /brightness/contrast/saturation/hue all reduce to this one shader — see effect-presets.ts). */
export interface ColorAdjustParams {
  brightness: number; // 1 = neutral
  contrast: number; // 1 = neutral
  saturation: number; // 1 = neutral, 0 = grayscale
  hueDeg: number; // 0 = neutral
  sepia: number; // 0..1 mix
  invert: number; // 0..1 mix
}

export interface BlurParams {
  radiusPx: number;
}

export interface VignetteParams {
  strength: number; // 0..1
}

export interface ChromaKeyParams {
  keyColor: [number, number, number]; // 0..1 rgb
  similarity: number; // 0..1
  smoothness: number; // 0..1
}

export interface GlowParams {
  threshold: number; // 0..1 luminance
  radiusPx: number;
  intensity: number; // additive strength
}

export interface LutParams {
  /** Single-row tile-strip cube LUT image: `size*size` px wide by `size` px
   * tall, `size` tiles left-to-right (one per B slice), each tile `size x
   * size` covering the R/G plane — see FRAGMENT_LUT in shaders.ts. */
  source: TexImageSource;
  size: number; // cube edge length (e.g. 8, 16, 64)
}

/** A single resolved effect step. Only the field matching `id` is read. */
export interface EffectStep {
  id: EffectId;
  colorAdjust?: ColorAdjustParams;
  blur?: BlurParams;
  vignette?: VignetteParams;
  chromaKey?: ChromaKeyParams;
  glow?: GlowParams;
  lut?: LutParams;
}

/** Pixel-space transform, deliberately shaped like editor-v2's ClipTransform
 * (x/y/w/h/rotation/opacity) so Phase 3/4 can pass timeline data through with
 * no translation layer. */
export interface Transform2D {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // degrees
  opacity: number; // 0..1
}

export interface ResolvedLayer {
  clipId: string;
  /** Either a raw browser source to upload this frame, or an already-uploaded pooled texture. */
  source: TexImageSource | WebGLTexture;
  sourceIsTexture: boolean;
  /** Required when `sourceIsTexture` is true — a WebGLTexture carries no
   * queryable dimensions, and the natural size can differ from `transform`'s
   * placement box (e.g. a 1920x1080 texture composited into a 400x300 box). */
  sourceWidth?: number;
  sourceHeight?: number;
  transform: Transform2D;
  effects?: EffectStep[];
  /** How the source maps into `transform`'s box when their aspect ratios
   * differ — mirrors CSS object-fit. Defaults to "cover". */
  fit?: "cover" | "contain" | "fill";
}

export interface TransitionSpec {
  type: "crossfade" | "slide" | "zoom";
  progress: number; // 0..1, 0 = fully "from", 1 = fully "to"
  fromClipId: string;
  toClipId: string;
}

export interface FrameTarget {
  width: number;
  height: number;
  /** null = default framebuffer (the canvas itself). */
  framebuffer: WebGLFramebuffer | null;
}

export interface FrameIdentity {
  frameId: number;
  presentationTimestamp: number;
  timelineTimestamp: number;
  clipIds: string[];
  version: number;
  textureId: number | null;
}
