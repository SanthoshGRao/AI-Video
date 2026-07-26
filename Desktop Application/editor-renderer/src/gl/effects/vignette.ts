/**
 * vignette.ts — radial darkening toward the frame edges.
 */

import { SHARED_VERTEX_SHADER } from "../geometry";
import { getProgram, setUniform1f, setUniform1i, useProgram, type GlProgram } from "../context";

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_texture;
uniform float u_strength; // 0..1

void main() {
  vec4 src = texture(u_texture, v_uv);
  vec2 centered = v_uv - 0.5;
  float dist = length(centered) * 1.4142135; // normalize so corners reach 1.0
  float vignette = 1.0 - smoothstep(0.3, 1.0, dist) * u_strength;
  outColor = vec4(src.rgb * vignette, src.a);
}
`;

export function getVignetteProgram(gl: WebGL2RenderingContext): GlProgram {
  return getProgram(gl, SHARED_VERTEX_SHADER, FRAGMENT_SHADER);
}

export function applyVignette(gl: WebGL2RenderingContext, program: GlProgram, strength: number): void {
  useProgram(gl, program);
  setUniform1i(gl, program, "u_texture", 0);
  setUniform1f(gl, program, "u_strength", strength);
}
