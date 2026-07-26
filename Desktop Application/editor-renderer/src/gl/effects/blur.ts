/**
 * blur.ts — separable two-pass gaussian blur (horizontal then vertical),
 * the standard GPU technique: an NxN blur factors into two 1D passes
 * instead of one O(N^2) pass.
 */

import { SHARED_VERTEX_SHADER } from "../geometry";
import { getProgram, setUniform1f, setUniform1i, setUniform2f, useProgram, type GlProgram } from "../context";

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform vec2 u_direction; // (1,0) horizontal pass, (0,1) vertical pass
uniform float u_sigma;

void main() {
  float sigma = max(u_sigma, 0.001);
  int radius = int(min(24.0, ceil(sigma * 2.5)));
  float total = 0.0;
  vec4 sum = vec4(0.0);

  for (int i = -radius; i <= radius; i++) {
    float x = float(i);
    float weight = exp(-(x * x) / (2.0 * sigma * sigma));
    vec2 offset = u_direction * u_texelSize * x;
    sum += texture(u_texture, v_uv + offset) * weight;
    total += weight;
  }

  outColor = sum / total;
}
`;

export function getBlurProgram(gl: WebGL2RenderingContext): GlProgram {
  return getProgram(gl, SHARED_VERTEX_SHADER, FRAGMENT_SHADER);
}

export function applyBlurPass(
  gl: WebGL2RenderingContext,
  program: GlProgram,
  sigma: number,
  direction: [number, number],
  width: number,
  height: number
): void {
  useProgram(gl, program);
  setUniform1i(gl, program, "u_texture", 0);
  setUniform1f(gl, program, "u_sigma", sigma);
  setUniform2f(gl, program, "u_direction", direction[0], direction[1]);
  setUniform2f(gl, program, "u_texelSize", 1 / width, 1 / height);
}
