/**
 * chromaKey.ts — distance-based color key with a soft edge, comparable to
 * ffmpeg's `colorkey` filter used on the export side (filtergraph-builder.ts)
 * so preview and export key out roughly the same range.
 */

import { SHARED_VERTEX_SHADER } from "../geometry";
import { getProgram, setUniform1f, setUniform1i, setUniform3f, useProgram, type GlProgram } from "../context";

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_texture;
uniform vec3 u_keyColor;
uniform float u_similarity; // 0..1, larger = keys out more
uniform float u_softness;   // 0..1, edge feather width

void main() {
  vec4 src = texture(u_texture, v_uv);
  float dist = distance(src.rgb, u_keyColor);
  float alpha = smoothstep(u_similarity, u_similarity + max(u_softness, 0.001), dist);
  outColor = vec4(src.rgb, src.a * alpha);
}
`;

export interface ChromaKeyParams {
  color: [number, number, number]; // 0..1
  similarity: number;
  softness: number;
}

export function getChromaKeyProgram(gl: WebGL2RenderingContext): GlProgram {
  return getProgram(gl, SHARED_VERTEX_SHADER, FRAGMENT_SHADER);
}

export function applyChromaKey(gl: WebGL2RenderingContext, program: GlProgram, params: ChromaKeyParams): void {
  useProgram(gl, program);
  setUniform1i(gl, program, "u_texture", 0);
  setUniform3f(gl, program, "u_keyColor", params.color[0], params.color[1], params.color[2]);
  setUniform1f(gl, program, "u_similarity", params.similarity);
  setUniform1f(gl, program, "u_softness", params.softness);
}

export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 1, 0];
  const int = parseInt(m[1], 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}
