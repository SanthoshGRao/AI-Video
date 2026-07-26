/**
 * glow.ts — bright-pass extract + screen-blend combine. The blur itself
 * reuses blur.ts's two-pass gaussian; this module supplies the two glow-
 * specific passes (threshold extract, screen combine) that sandwich it.
 * Orchestrated by effects.ts since it needs two source textures at once
 * (the pre-glow frame and the blurred bright-pass), unlike the other
 * single-input effects.
 */

import { SHARED_VERTEX_SHADER } from "../geometry";
import { getProgram, setUniform1f, setUniform1i, useProgram, type GlProgram } from "../context";

const THRESHOLD_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_texture;
uniform float u_threshold; // 0..1 luminance cutoff

void main() {
  vec4 src = texture(u_texture, v_uv);
  float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  float amount = smoothstep(u_threshold, 1.0, luma);
  outColor = vec4(src.rgb * amount, src.a);
}
`;

const COMBINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_base;
uniform sampler2D u_bloom;
uniform float u_strength;

void main() {
  vec4 base = texture(u_base, v_uv);
  vec4 bloom = texture(u_bloom, v_uv);
  vec3 screen = 1.0 - (1.0 - base.rgb) * (1.0 - bloom.rgb * u_strength);
  outColor = vec4(screen, base.a);
}
`;

export function getGlowThresholdProgram(gl: WebGL2RenderingContext): GlProgram {
  return getProgram(gl, SHARED_VERTEX_SHADER, THRESHOLD_FRAGMENT_SHADER);
}

export function getGlowCombineProgram(gl: WebGL2RenderingContext): GlProgram {
  return getProgram(gl, SHARED_VERTEX_SHADER, COMBINE_FRAGMENT_SHADER);
}

export function applyGlowThreshold(gl: WebGL2RenderingContext, program: GlProgram, threshold = 0.7): void {
  useProgram(gl, program);
  setUniform1i(gl, program, "u_texture", 0);
  setUniform1f(gl, program, "u_threshold", threshold);
}

export function applyGlowCombine(
  gl: WebGL2RenderingContext,
  program: GlProgram,
  baseUnit: number,
  bloomUnit: number,
  strength: number
): void {
  useProgram(gl, program);
  setUniform1i(gl, program, "u_base", baseUnit);
  setUniform1i(gl, program, "u_bloom", bloomUnit);
  setUniform1f(gl, program, "u_strength", strength);
}
