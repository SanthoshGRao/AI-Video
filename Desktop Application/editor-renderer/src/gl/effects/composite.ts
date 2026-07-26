/**
 * composite.ts — draws a texture as a positioned/rotated/opacity-blended
 * quad. Used for two things: (1) resizing a decoded video/image frame
 * into a clip-local-sized target before the effects chain runs on it, and
 * (2) compositing an already-effected clip-local texture into the running
 * canvas-sized layer at its transform position. Both share this shader —
 * a resize is just an identity transform against a differently-sized
 * viewport.
 */

import { getProgram, setUniform1f, setUniform1i, setUniformMatrix3, useProgram, type GlProgram } from "../context";
import type { Mat3 } from "../mat3";

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform mat3 u_transform;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec3 pos = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_texture;
uniform float u_opacity;

void main() {
  vec4 src = texture(u_texture, v_uv);
  outColor = vec4(src.rgb, src.a * u_opacity);
}
`;

export function getCompositeProgram(gl: WebGL2RenderingContext): GlProgram {
  return getProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
}

const IDENTITY: Mat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export function applyComposite(
  gl: WebGL2RenderingContext,
  program: GlProgram,
  transform: Mat3 | null,
  opacity: number
): void {
  useProgram(gl, program);
  setUniform1i(gl, program, "u_texture", 0);
  setUniform1f(gl, program, "u_opacity", opacity);
  setUniformMatrix3(gl, program, "u_transform", transform ?? IDENTITY);
}
