/**
 * wasm-compositor.ts — Rust/wgpu-backed frame compositor, vendored from
 * OpenCut (see rust/NOTICE.md at the repo root) and compiled locally to the
 * `opencut-wasm` package. Used by export-render-worker (page.tsx) as the
 * primary compositor, with the WebGL2 `GpuCompositor` (compositor.ts) kept
 * as an automatic fallback when WebGPU/WebGL/wgpu isn't available.
 *
 * The Rust side only knows shader identifiers + numeric uniforms (see
 * rust/crates/effects/src/pipeline.rs) — this module is the TS-side
 * "which passes does effect X need" logic, mirroring compositor.ts's
 * `applyEffects` but targeting those shader ids instead of GLSL programs.
 */
import {
  initializeGpu as wasmInitializeGpu,
  initCompositor as wasmInitCompositor,
  resizeCompositor as wasmResizeCompositor,
  getCompositorCanvas as wasmGetCompositorCanvas,
  uploadTexture as wasmUploadTexture,
  releaseTexture as wasmReleaseTexture,
  renderFrame as wasmRenderFrame,
} from "opencut-wasm";
import type { ColorAdjustParams, EffectStep } from "./types";

export interface EffectPassDescriptor {
  shader: string;
  uniforms: Record<string, number | number[]>;
}

interface QuadTransformDescriptor {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotationDegrees: number;
  flipX: boolean;
  flipY: boolean;
}

interface LayerItemDescriptor {
  type: "layer";
  textureId: string;
  transform: QuadTransformDescriptor;
  opacity: number;
  blendMode: "normal";
  effectPassGroups: EffectPassDescriptor[][];
  mask: null;
}

interface FrameDescriptor {
  width: number;
  height: number;
  clear: { color: [number, number, number, number] };
  items: LayerItemDescriptor[];
}

export interface WasmLayerInput {
  clipId: string;
  /** Pre-fitted source (object-fit already resolved) sized exactly to the
   * destination rect in device pixels — see resolveFitCanvas() in page.tsx. */
  source: OffscreenCanvas;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotationDeg: number;
  opacity: number;
  effects?: EffectStep[];
}

function isNeutralColorAdjust(p: ColorAdjustParams | undefined): boolean {
  if (!p) return true;
  return (
    p.brightness === 1 &&
    p.contrast === 1 &&
    p.saturation === 1 &&
    p.hueDeg === 0 &&
    p.sepia === 0 &&
    p.invert === 0
  );
}

/** Mirrors compositor.ts's `applyEffects` pass-building. `effect_pass_groups`
 * groups run strictly sequentially in Rust (see frame.rs's
 * apply_effect_groups), so one flat group is equivalent to the WebGL2 path's
 * chain of intermediate textures. */
function effectStepsToPasses(steps: EffectStep[] | undefined): EffectPassDescriptor[] {
  const passes: EffectPassDescriptor[] = [];
  for (const step of steps ?? []) {
    switch (step.id) {
      case "blur": {
        const radius = step.blur?.radiusPx ?? 3;
        const sigma = Math.max(radius / 2, 0.5);
        passes.push({ shader: "gaussian-blur", uniforms: { u_sigma: sigma, u_step: 1, u_direction: [1, 0] } });
        passes.push({ shader: "gaussian-blur", uniforms: { u_sigma: sigma, u_step: 1, u_direction: [0, 1] } });
        break;
      }
      case "vignette": {
        const strength = step.vignette?.strength ?? 0.5;
        passes.push({ shader: "vignette", uniforms: { u_strength: strength } });
        break;
      }
      case "chromaKey": {
        const p = step.chromaKey ?? { keyColor: [0, 1, 0] as [number, number, number], similarity: 0.4, smoothness: 0.1 };
        passes.push({
          shader: "chroma-key",
          uniforms: { u_keyColor: [...p.keyColor], u_similarity: p.similarity, u_smoothness: p.smoothness },
        });
        break;
      }
      case "glow": {
        const p = step.glow ?? { threshold: 0.7, radiusPx: 6, intensity: 0.6 };
        const sigma = Math.max(p.radiusPx / 2, 0.5);
        passes.push({ shader: "bright-pass", uniforms: { u_threshold: p.threshold } });
        passes.push({ shader: "gaussian-blur", uniforms: { u_sigma: sigma, u_step: 1, u_direction: [1, 0] } });
        passes.push({ shader: "gaussian-blur", uniforms: { u_sigma: sigma, u_step: 1, u_direction: [0, 1] } });
        passes.push({ shader: "add-blend", uniforms: { u_intensity: p.intensity } });
        break;
      }
      case "lut":
        // Cube-LUT sampling needs a 3rd texture binding the Rust compositor
        // doesn't expose yet — matches the pre-existing gap already logged/
        // skipped in Desktop Application's export-runner.ts (mapEffectToWire).
        break;
      default: {
        // Named presets (grayscale/sepia/vintage/...) and brightness/
        // contrast/saturation/hue all reduce to colorAdjust — effect-presets.ts.
        if (isNeutralColorAdjust(step.colorAdjust)) break;
        const p = step.colorAdjust!;
        passes.push({
          shader: "color-adjust",
          uniforms: {
            u_brightness: p.brightness,
            u_contrast: p.contrast,
            u_saturation: p.saturation,
            u_hueDeg: p.hueDeg,
            u_sepia: p.sepia,
            u_invert: p.invert,
          },
        });
      }
    }
  }
  return passes;
}

export class WasmCompositor {
  private width = 0;
  private height = 0;
  private uploadedIds = new Set<string>();
  private readbackCanvas: OffscreenCanvas | null = null;
  private readbackCtx: OffscreenCanvasRenderingContext2D | null = null;

  /** Must succeed before any instance method is called. Throws on failure —
   * callers should catch and fall back to the WebGL2 GpuCompositor. */
  static async initializeGpu(): Promise<void> {
    await wasmInitializeGpu();
  }

  private ensureSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    if (this.width === 0 && this.height === 0) {
      wasmInitCompositor(width, height);
    } else {
      wasmResizeCompositor(width, height);
    }
    this.width = width;
    this.height = height;
  }

  /** Composites one frame and returns raw top-row-first RGBA bytes, matching
   * the contract render-window.ts / encode-pipeline.ts expect. */
  async renderFrame(width: number, height: number, layers: WasmLayerInput[]): Promise<Uint8Array> {
    this.ensureSize(width, height);

    const nextIds = new Set<string>();
    for (const layer of layers) {
      wasmUploadTexture({
        id: layer.clipId,
        source: layer.source,
        width: layer.source.width,
        height: layer.source.height,
      });
      nextIds.add(layer.clipId);
    }
    for (const id of this.uploadedIds) {
      if (!nextIds.has(id)) wasmReleaseTexture(id);
    }
    this.uploadedIds = nextIds;

    const descriptor: FrameDescriptor = {
      width,
      height,
      clear: { color: [0, 0, 0, 0] },
      items: layers.map((layer) => {
        const passes = effectStepsToPasses(layer.effects);
        return {
          type: "layer",
          textureId: layer.clipId,
          transform: {
            centerX: layer.centerX,
            centerY: layer.centerY,
            width: layer.width,
            height: layer.height,
            rotationDegrees: layer.rotationDeg,
            flipX: false,
            flipY: false,
          },
          opacity: layer.opacity,
          blendMode: "normal",
          // A group containing zero passes errors in Rust ("At least one
          // effect pass is required") — omit the group entirely when empty.
          effectPassGroups: passes.length > 0 ? [passes] : [],
          mask: null,
        };
      }),
    };

    wasmRenderFrame(descriptor);

    // The WebGPU/WebGL surface `renderFrame` presents to isn't guaranteed to
    // be composited into the canvas synchronously — reading it back with
    // drawImage() immediately after can capture a stale/blank frame. One
    // rAF tick is enough for the browser to composite the presented surface.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const canvas = wasmGetCompositorCanvas();
    if (!this.readbackCanvas || this.readbackCanvas.width !== width || this.readbackCanvas.height !== height) {
      this.readbackCanvas = new OffscreenCanvas(width, height);
      this.readbackCtx = this.readbackCanvas.getContext("2d");
    }
    const ctx = this.readbackCtx!;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(canvas, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    return new Uint8Array(imageData.data.buffer);
  }
}
