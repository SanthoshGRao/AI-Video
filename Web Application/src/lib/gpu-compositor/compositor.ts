import { createGpuContext, getOrCompileProgram, type GpuContext } from "./context";
import {
  VERTEX_SHADER,
  FRAGMENT_PASSTHROUGH,
  FRAGMENT_COLOR_ADJUST,
  FRAGMENT_BLUR,
  FRAGMENT_VIGNETTE,
  FRAGMENT_CHROMA_KEY,
  FRAGMENT_BRIGHT_PASS,
  FRAGMENT_ADD_BLEND,
  FRAGMENT_LUT,
} from "./shaders";
import { buildFrameIdentity, createFrameIdCounter } from "./frame-identity";
import { NO_EFFECT } from "./effect-presets";
import type {
  EffectStep,
  FrameIdentity,
  FrameTarget,
  ResolvedLayer,
  Transform2D,
  TransitionSpec,
} from "./types";

const PROGRAM_KEYS = {
  passthrough: "passthrough",
  colorAdjust: "colorAdjust",
  blur: "blur",
  vignette: "vignette",
  chromaKey: "chromaKey",
  brightPass: "brightPass",
  addBlend: "addBlend",
  lut: "lut",
} as const;

function isNeutralColorAdjust(step: EffectStep): boolean {
  const p = step.colorAdjust;
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

/** Caches uniform locations per (program, name) — looking them up is a
 * string-keyed GL round trip, and programs/uniform names are stable across
 * frames. */
class UniformCache {
  private byProgram = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

  get(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let cache = this.byProgram.get(program);
    if (!cache) {
      cache = new Map();
      this.byProgram.set(program, cache);
    }
    if (cache.has(name)) return cache.get(name)!;
    const loc = gl.getUniformLocation(program, name);
    cache.set(name, loc);
    return loc;
  }
}

interface PassOptions {
  /** Placement in the target — omit for internal 1:1 processing passes
   * (fills the whole pass target, no rotation). */
  rect?: { x: number; y: number; w: number; h: number; rotationDeg: number };
  opacity?: number;
  blend?: boolean;
  extraTexture?: { uniform: string; texture: WebGLTexture; unit: number };
  /** UV crop (object-fit) — defaults to identity (sample the whole source). */
  uv?: { scale: [number, number]; offset: [number, number] };
  setUniforms?: (gl: WebGL2RenderingContext, program: WebGLProgram, uniforms: UniformCache) => void;
}

/** Computes the UV scale/offset that crops a source of `srcW x srcH` to
 * emulate CSS object-fit within a `dstW x dstH` box. "contain" only needs a
 * UV identity (no cropping) — its letterboxing comes from shrinking the
 * destination rect instead, see resolveFitRect(). */
function resolveFitUv(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  fit: "cover" | "contain" | "fill",
): { scale: [number, number]; offset: [number, number] } {
  if (fit === "fill" || fit === "contain" || !srcW || !srcH || !dstW || !dstH) {
    return { scale: [1, 1], offset: [0, 0] };
  }
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  if (srcAspect > dstAspect) {
    // Source is relatively wider than the box — crop its left/right edges.
    const scaleX = dstAspect / srcAspect;
    return { scale: [scaleX, 1], offset: [(1 - scaleX) / 2, 0] };
  }
  // Source is relatively taller than the box — crop its top/bottom edges.
  const scaleY = srcAspect / dstAspect;
  return { scale: [1, scaleY], offset: [0, (1 - scaleY) / 2] };
}

/** For "contain", shrinks the placement rect (keeping it centered in the
 * original box) so the whole source is visible with letterbox space around
 * it, instead of cropping. */
function resolveFitRect(
  rect: { x: number; y: number; w: number; h: number },
  srcW: number,
  srcH: number,
  fit: "cover" | "contain" | "fill",
): { x: number; y: number; w: number; h: number } {
  if (fit !== "contain" || !srcW || !srcH) return rect;
  const srcAspect = srcW / srcH;
  const dstAspect = rect.w / rect.h;
  if (srcAspect > dstAspect) {
    const h = rect.w / srcAspect;
    return { x: rect.x, y: rect.y + (rect.h - h) / 2, w: rect.w, h };
  }
  const w = rect.h * srcAspect;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y, w, h: rect.h };
}

export class GpuCompositor {
  private ctx: GpuContext;
  private uniforms = new UniformCache();
  private nextFrameId = createFrameIdCounter();
  private lutTextureCache = new WeakMap<TexImageSource, WebGLTexture>();

  constructor(canvasOrContext: HTMLCanvasElement | OffscreenCanvas | GpuContext) {
    this.ctx =
      "gl" in canvasOrContext ? (canvasOrContext as GpuContext) : createGpuContext(canvasOrContext);
  }

  get context(): GpuContext {
    return this.ctx;
  }

  dispose(): void {
    this.ctx.dispose();
  }

  /** Uploads a browser image/video/canvas source into a fresh (non-pooled —
   * source content changes every call) texture. */
  private uploadSource(source: TexImageSource): { texture: WebGLTexture; width: number; height: number } {
    const gl = this.ctx.gl;
    const { width, height } = sourceDimensions(source);
    const texture = gl.createTexture();
    if (!texture) throw new Error("uploadSource: gl.createTexture() failed");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { texture, width, height };
  }

  private getLutTexture(source: TexImageSource): WebGLTexture {
    const cached = this.lutTextureCache.get(source);
    if (cached) return cached;
    const { texture } = this.uploadSource(source);
    this.lutTextureCache.set(source, texture);
    return texture;
  }

  private runPass(
    programKey: string,
    fragSrc: string,
    sourceTexture: WebGLTexture,
    target: FrameTarget,
    options: PassOptions,
  ): void {
    const { gl } = this.ctx;
    const program = getOrCompileProgram(this.ctx, programKey, VERTEX_SHADER, fragSrc);
    const rect = options.rect ?? { x: 0, y: 0, w: target.width, h: target.height, rotationDeg: 0 };

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(program);
    gl.bindVertexArray(this.ctx.quadVao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(this.uniforms.get(gl, program, "u_tex"), 0);

    if (options.extraTexture) {
      const { uniform, texture, unit } = options.extraTexture;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.uniforms.get(gl, program, uniform), unit);
    }

    gl.uniform2f(this.uniforms.get(gl, program, "u_targetSize"), target.width, target.height);
    gl.uniform4f(this.uniforms.get(gl, program, "u_rect"), rect.x, rect.y, rect.w, rect.h);
    gl.uniform1f(
      this.uniforms.get(gl, program, "u_rotationRad"),
      (rect.rotationDeg * Math.PI) / 180,
    );
    gl.uniform1f(this.uniforms.get(gl, program, "u_opacity"), options.opacity ?? 1);
    const uv = options.uv ?? { scale: [1, 1] as [number, number], offset: [0, 0] as [number, number] };
    gl.uniform2f(this.uniforms.get(gl, program, "u_uvScale"), uv.scale[0], uv.scale[1]);
    gl.uniform2f(this.uniforms.get(gl, program, "u_uvOffset"), uv.offset[0], uv.offset[1]);

    options.setUniforms?.(gl, program, this.uniforms);

    if (options.blend) {
      // Standard "over" compositing for straight (non-premultiplied) alpha —
      // matches the straight-alpha color math every fragment shader does.
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.disable(gl.BLEND);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Runs one internal 1:1 processing pass into a freshly pooled texture of
   * the same size as the input. Caller owns (and must release) the result. */
  private processToTexture(
    programKey: string,
    fragSrc: string,
    sourceTexture: WebGLTexture,
    width: number,
    height: number,
    setUniforms?: PassOptions["setUniforms"],
    extraTexture?: PassOptions["extraTexture"],
  ): WebGLTexture {
    const outTexture = this.ctx.texturePool.acquire(width, height);
    const fbo = this.ctx.framebufferPool.getOrCreate(outTexture);
    this.runPass(programKey, fragSrc, sourceTexture, { width, height, framebuffer: fbo }, {
      setUniforms,
      extraTexture,
    });
    return outTexture;
  }

  /** Applies a layer's effect chain, returning a texture holding the result
   * (pooled intermediates along the way are released as they're consumed;
   * the caller is responsible for releasing the returned texture once it's
   * done being used as a composite source). */
  private applyEffects(
    sourceTexture: WebGLTexture,
    width: number,
    height: number,
    effects: EffectStep[] | undefined,
  ): WebGLTexture {
    let current = sourceTexture;
    let ownsCurrent = false; // false while `current` is still the caller-owned source texture

    for (const step of effects ?? []) {
      let next: WebGLTexture | null = null;

      switch (step.id) {
        case "blur": {
          const radius = step.blur?.radiusPx ?? 3;
          const horizontal = this.processToTexture(
            PROGRAM_KEYS.blur,
            FRAGMENT_BLUR,
            current,
            width,
            height,
            (gl, program) => gl.uniform2f(this.uniforms.get(gl, program, "u_direction"), radius / width, 0),
          );
          next = this.processToTexture(
            PROGRAM_KEYS.blur,
            FRAGMENT_BLUR,
            horizontal,
            width,
            height,
            (gl, program) => gl.uniform2f(this.uniforms.get(gl, program, "u_direction"), 0, radius / height),
          );
          this.ctx.texturePool.release(horizontal);
          break;
        }
        case "vignette": {
          const strength = step.vignette?.strength ?? 0.5;
          next = this.processToTexture(
            PROGRAM_KEYS.vignette,
            FRAGMENT_VIGNETTE,
            current,
            width,
            height,
            (gl, program) => gl.uniform1f(this.uniforms.get(gl, program, "u_strength"), strength),
          );
          break;
        }
        case "chromaKey": {
          const p = step.chromaKey ?? { keyColor: [0, 1, 0] as [number, number, number], similarity: 0.4, smoothness: 0.1 };
          next = this.processToTexture(
            PROGRAM_KEYS.chromaKey,
            FRAGMENT_CHROMA_KEY,
            current,
            width,
            height,
            (gl, program) => {
              gl.uniform3f(this.uniforms.get(gl, program, "u_keyColor"), ...p.keyColor);
              gl.uniform1f(this.uniforms.get(gl, program, "u_similarity"), p.similarity);
              gl.uniform1f(this.uniforms.get(gl, program, "u_smoothness"), p.smoothness);
            },
          );
          break;
        }
        case "glow": {
          const p = step.glow ?? { threshold: 0.7, radiusPx: 6, intensity: 0.6 };
          const bright = this.processToTexture(
            PROGRAM_KEYS.brightPass,
            FRAGMENT_BRIGHT_PASS,
            current,
            width,
            height,
            (gl, program) => gl.uniform1f(this.uniforms.get(gl, program, "u_threshold"), p.threshold),
          );
          const blurredH = this.processToTexture(
            PROGRAM_KEYS.blur,
            FRAGMENT_BLUR,
            bright,
            width,
            height,
            (gl, program) => gl.uniform2f(this.uniforms.get(gl, program, "u_direction"), p.radiusPx / width, 0),
          );
          const blurred = this.processToTexture(
            PROGRAM_KEYS.blur,
            FRAGMENT_BLUR,
            blurredH,
            width,
            height,
            (gl, program) => gl.uniform2f(this.uniforms.get(gl, program, "u_direction"), 0, p.radiusPx / height),
          );
          this.ctx.texturePool.release(bright);
          this.ctx.texturePool.release(blurredH);
          next = this.processToTexture(
            PROGRAM_KEYS.addBlend,
            FRAGMENT_ADD_BLEND,
            current,
            width,
            height,
            (gl, program) => gl.uniform1f(this.uniforms.get(gl, program, "u_intensity"), p.intensity),
            { uniform: "u_texB", texture: blurred, unit: 1 },
          );
          this.ctx.texturePool.release(blurred);
          break;
        }
        case "lut": {
          if (!step.lut) break;
          const lutTexture = this.getLutTexture(step.lut.source);
          next = this.processToTexture(
            PROGRAM_KEYS.lut,
            FRAGMENT_LUT,
            current,
            width,
            height,
            (gl, program) => gl.uniform1f(this.uniforms.get(gl, program, "u_lutSize"), step.lut!.size),
            { uniform: "u_lut", texture: lutTexture, unit: 1 },
          );
          break;
        }
        default: {
          // Named color presets + brightness/contrast/saturation/hue all
          // reduce to the color-adjust shader (see effect-presets.ts).
          if (isNeutralColorAdjust(step)) break;
          const p = step.colorAdjust!;
          next = this.processToTexture(
            PROGRAM_KEYS.colorAdjust,
            FRAGMENT_COLOR_ADJUST,
            current,
            width,
            height,
            (gl, program) => {
              gl.uniform1f(this.uniforms.get(gl, program, "u_brightness"), p.brightness);
              gl.uniform1f(this.uniforms.get(gl, program, "u_contrast"), p.contrast);
              gl.uniform1f(this.uniforms.get(gl, program, "u_saturation"), p.saturation);
              gl.uniform1f(this.uniforms.get(gl, program, "u_hueDeg"), p.hueDeg);
              gl.uniform1f(this.uniforms.get(gl, program, "u_sepia"), p.sepia);
              gl.uniform1f(this.uniforms.get(gl, program, "u_invert"), p.invert);
            },
          );
        }
      }

      if (next) {
        if (ownsCurrent) this.ctx.texturePool.release(current);
        current = next;
        ownsCurrent = true;
      }
    }

    // If nothing produced a new texture, the caller's source is still what
    // we're compositing — that's fine, we just don't own it.
    return current;
  }

  /**
   * Renders one composed frame: applies each layer's effects and draws it
   * onto `target` in array order (back to front), honouring transform and
   * opacity. Transitions blend the two named layers' opacity/transform
   * per `transitions`.
   */
  compositeFrame(
    layers: ResolvedLayer[],
    target: FrameTarget,
    identity: { presentationTimestamp: number; timelineTimestamp: number; version: number },
    transitions: TransitionSpec[] = [],
    clearColor: [number, number, number, number] = [0, 0, 0, 0],
  ): FrameIdentity {
    const { gl } = this.ctx;

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(...clearColor);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    for (const layer of layers) {
      const transform = resolveTransitionedTransform(layer, transitions);
      if (transform.opacity <= 0) continue;

      const uploaded = layer.sourceIsTexture
        ? null
        : this.uploadSource(layer.source as TexImageSource);
      const sourceTexture = uploaded ? uploaded.texture : (layer.source as WebGLTexture);
      const width = uploaded?.width ?? layer.sourceWidth;
      const height = uploaded?.height ?? layer.sourceHeight;
      if (!width || !height) {
        throw new Error(
          `compositeFrame: layer "${layer.clipId}" has sourceIsTexture=true but no sourceWidth/sourceHeight`,
        );
      }

      const processed = this.applyEffects(sourceTexture, width, height, layer.effects);

      const fit = layer.fit ?? "cover";
      const fitRect = resolveFitRect(transform, width, height, fit);
      const uv = resolveFitUv(width, height, fitRect.w, fitRect.h, fit);

      this.runPass(PROGRAM_KEYS.passthrough, FRAGMENT_PASSTHROUGH, processed, target, {
        rect: { x: fitRect.x, y: fitRect.y, w: fitRect.w, h: fitRect.h, rotationDeg: transform.rotation },
        opacity: transform.opacity,
        blend: true,
        uv,
      });

      if (processed !== sourceTexture) this.ctx.texturePool.release(processed);
      if (uploaded) gl.deleteTexture(uploaded.texture); // source uploads aren't pooled — see uploadSource()
    }

    return buildFrameIdentity({
      frameId: this.nextFrameId(),
      presentationTimestamp: identity.presentationTimestamp,
      timelineTimestamp: identity.timelineTimestamp,
      clipIds: layers.map((l) => l.clipId),
      version: identity.version,
      textureId: null,
    });
  }
}

function sourceDimensions(source: TexImageSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight };
  if ("width" in source && "height" in source) {
    return { width: source.width as number, height: source.height as number };
  }
  throw new Error("sourceDimensions: unsupported TexImageSource");
}

function resolveTransitionedTransform(layer: ResolvedLayer, transitions: TransitionSpec[]): Transform2D {
  const relevant = transitions.find(
    (t) => t.fromClipId === layer.clipId || t.toClipId === layer.clipId,
  );
  if (!relevant) return layer.transform;

  const isFrom = relevant.fromClipId === layer.clipId;
  const progress = isFrom ? 1 - relevant.progress : relevant.progress;
  const t = layer.transform;

  switch (relevant.type) {
    case "crossfade":
      return { ...t, opacity: t.opacity * progress };
    case "slide": {
      const dir = isFrom ? -1 : 1;
      return { ...t, x: t.x + dir * t.w * (1 - progress), opacity: t.opacity };
    }
    case "zoom": {
      const scale = isFrom ? 1 + (1 - progress) * 0.3 : 0.7 + progress * 0.3;
      const w = t.w * scale;
      const h = t.h * scale;
      return {
        ...t,
        x: t.x - (w - t.w) / 2,
        y: t.y - (h - t.h) / 2,
        w,
        h,
        opacity: t.opacity * progress,
      };
    }
    default:
      return t;
  }
}
