/**
 * lut.ts — 3D LUT color grading via a "strip" 2D LUT texture (size*size
 * wide, size tall — the standard trick for sampling a 3D LUT on hardware
 * without 3D texture support headaches). The shader machinery here is
 * complete; wiring an actual LUT image asset into the media pipeline
 * (loading it as a texture the way video/image assets are loaded) is not
 * done yet — same documented gap as the export side (filtergraph-builder.ts).
 * Until an asset is wired in, compositor.ts skips this effect with a
 * console warning rather than fail.
 */

import { SHARED_VERTEX_SHADER } from "../geometry";
import { getProgram, setUniform1f, setUniform1i, useProgram, type GlProgram } from "../context";

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_texture;
uniform sampler2D u_lut;
uniform float u_lutSize; // number of levels per channel (e.g. 8, 16, 32)
uniform float u_strength; // 0..1 blend with original

vec3 sampleLut(vec3 color) {
  float size = u_lutSize;
  float sliceSize = 1.0 / size;
  float sliceIndex = color.b * (size - 1.0);
  float sliceFloor = floor(sliceIndex);
  float sliceFrac = sliceIndex - sliceFloor;

  vec2 texelSize = vec2(1.0 / (size * size), 1.0 / size);
  vec2 rg = color.rg * (size - 1.0) * texelSize;

  vec2 uv0 = vec2(sliceFloor * sliceSize, 0.0) + rg;
  vec2 uv1 = vec2(min(sliceFloor + 1.0, size - 1.0) * sliceSize, 0.0) + rg;

  vec3 c0 = texture(u_lut, uv0).rgb;
  vec3 c1 = texture(u_lut, uv1).rgb;
  return mix(c0, c1, sliceFrac);
}

void main() {
  vec4 src = texture(u_texture, v_uv);
  vec3 graded = sampleLut(clamp(src.rgb, 0.0, 1.0));
  outColor = vec4(mix(src.rgb, graded, u_strength), src.a);
}
`;

export function getLutProgram(gl: WebGL2RenderingContext): GlProgram {
  return getProgram(gl, SHARED_VERTEX_SHADER, FRAGMENT_SHADER);
}

export function applyLut(
  gl: WebGL2RenderingContext,
  program: GlProgram,
  lutTextureUnit: number,
  lutSize: number,
  strength: number
): void {
  useProgram(gl, program);
  setUniform1i(gl, program, "u_texture", 0);
  setUniform1i(gl, program, "u_lut", lutTextureUnit);
  setUniform1f(gl, program, "u_lutSize", lutSize);
  setUniform1f(gl, program, "u_strength", strength);
}
