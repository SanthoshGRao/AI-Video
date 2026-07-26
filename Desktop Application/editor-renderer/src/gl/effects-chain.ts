/**
 * effects-chain.ts — applies a NativeClip's ordered EffectInstance[] chain
 * to a source texture via ping-pong FBOs, one pass per effect (two passes
 * for blur, three for glow). Returns the final FboTarget; the caller is
 * responsible for releasing it back to the pool once done reading from it.
 */

import type { EffectInstance } from "../../../src/editor/model/types";
import { drawQuad, getQuadVao } from "./geometry";
import type { FramebufferPool, FboTarget } from "./framebuffer-pool";
import { applyColor, getColorProgram, presetToColorParams } from "./effects/color";
import { applyBlurPass, getBlurProgram } from "./effects/blur";
import { applyChromaKey, getChromaKeyProgram, hexToRgb01 } from "./effects/chromaKey";
import { applyVignette, getVignetteProgram } from "./effects/vignette";
import { applyGlowCombine, applyGlowThreshold, getGlowCombineProgram, getGlowThresholdProgram } from "./effects/glow";

export interface EffectPrograms {
  color: ReturnType<typeof getColorProgram>;
  blur: ReturnType<typeof getBlurProgram>;
  chromaKey: ReturnType<typeof getChromaKeyProgram>;
  vignette: ReturnType<typeof getVignetteProgram>;
  glowThreshold: ReturnType<typeof getGlowThresholdProgram>;
  glowCombine: ReturnType<typeof getGlowCombineProgram>;
}

export function createEffectPrograms(gl: WebGL2RenderingContext): EffectPrograms {
  return {
    color: getColorProgram(gl),
    blur: getBlurProgram(gl),
    chromaKey: getChromaKeyProgram(gl),
    vignette: getVignetteProgram(gl),
    glowThreshold: getGlowThresholdProgram(gl),
    glowCombine: getGlowCombineProgram(gl),
  };
}

function renderPass(
  gl: WebGL2RenderingContext,
  target: FboTarget,
  sourceTexture: WebGLTexture,
  vao: WebGLVertexArrayObject
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  drawQuad(gl, vao);
}

/**
 * Returns the texture to actually draw (either the original source, if no
 * effects apply, or the final FBO target from the chain — call
 * `releaseIfOwned` after use either way).
 */
export function applyEffectsChain(
  gl: WebGL2RenderingContext,
  fboPool: FramebufferPool,
  programs: EffectPrograms,
  sourceTexture: WebGLTexture,
  width: number,
  height: number,
  effects: EffectInstance[]
): { texture: WebGLTexture; owned: FboTarget | null } {
  if (effects.length === 0) return { texture: sourceTexture, owned: null };

  const vao = getQuadVao(gl);

  let currentTex = sourceTexture;
  let owned: FboTarget | null = null;

  for (const effect of effects) {
    if (effect.type === "lut") {
      console.warn("[effects-chain] 'lut' effect skipped — no LUT asset texture wired up yet");
      continue;
    }

    if (effect.type === "blur") {
      const horiz = fboPool.acquire(width, height);
      applyBlurPass(gl, programs.blur, effect.radiusPx / 3, [1, 0], width, height);
      renderPass(gl, horiz, currentTex, vao);

      const vert = fboPool.acquire(width, height);
      applyBlurPass(gl, programs.blur, effect.radiusPx / 3, [0, 1], width, height);
      renderPass(gl, vert, horiz.texture, vao);
      fboPool.release(horiz);

      if (owned) fboPool.release(owned);
      owned = vert;
      currentTex = vert.texture;
      continue;
    }

    if (effect.type === "glow") {
      const bright = fboPool.acquire(width, height);
      applyGlowThreshold(gl, programs.glowThreshold, 0.7);
      renderPass(gl, bright, currentTex, vao);

      const blurH = fboPool.acquire(width, height);
      applyBlurPass(gl, programs.blur, 4, [1, 0], width, height);
      renderPass(gl, blurH, bright.texture, vao);
      fboPool.release(bright);

      const blurV = fboPool.acquire(width, height);
      applyBlurPass(gl, programs.blur, 4, [0, 1], width, height);
      renderPass(gl, blurV, blurH.texture, vao);
      fboPool.release(blurH);

      const combined = fboPool.acquire(width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, combined.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blurV.texture);
      applyGlowCombine(gl, programs.glowCombine, 0, 1, effect.strength);
      drawQuad(gl, vao);
      fboPool.release(blurV);

      if (owned) fboPool.release(owned);
      owned = combined;
      currentTex = combined.texture;
      continue;
    }

    const target = fboPool.acquire(width, height);

    if (effect.type === "chromaKey") {
      applyChromaKey(gl, programs.chromaKey, {
        color: hexToRgb01(effect.color),
        similarity: effect.tolerance,
        softness: 0.08,
      });
    } else if (effect.type === "vignette") {
      applyVignette(gl, programs.vignette, effect.strength);
    } else if (effect.type === "preset") {
      const params = presetToColorParams(effect.id);
      applyColor(gl, programs.color, params ?? {});
    } else {
      // brightness | contrast | saturation | hueRotate
      const params =
        effect.type === "brightness"
          ? { brightness: effect.amount }
          : effect.type === "contrast"
            ? { contrast: 1 + effect.amount }
            : effect.type === "saturation"
              ? { saturation: 1 + effect.amount }
              : { hueDeg: effect.amount };
      applyColor(gl, programs.color, params);
    }

    renderPass(gl, target, currentTex, vao);
    if (owned) fboPool.release(owned);
    owned = target;
    currentTex = target.texture;
  }

  return { texture: currentTex, owned };
}
