/**
 * color.ts — one shader covers brightness/contrast/saturation/hueRotate
 * (a "color-matrix" family, per the plan) plus the 7 legacy CSS-filter
 * presets (grayscale/sepia/vintage/vivid/cool/warm/invert), which are
 * just fixed parameter combinations of the same primitives.
 */

import { SHARED_VERTEX_SHADER } from "../geometry";
import { getProgram, setUniform1f, setUniform1i, useProgram, type GlProgram } from "../context";

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_texture;
uniform float u_brightness; // additive, -1..1
uniform float u_contrast;   // multiplicative around 0.5, 0..3
uniform float u_saturation; // multiplicative, 0..3
uniform float u_hueDeg;     // degrees
uniform int u_invert;
uniform float u_sepiaAmount; // 0..1

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 src = texture(u_texture, v_uv);
  vec3 color = src.rgb;

  color += u_brightness;
  color = (color - 0.5) * u_contrast + 0.5;

  vec3 hsv = rgb2hsv(clamp(color, 0.0, 1.0));
  hsv.y = clamp(hsv.y * u_saturation, 0.0, 1.0);
  hsv.x = fract(hsv.x + u_hueDeg / 360.0);
  color = hsv2rgb(hsv);

  if (u_invert == 1) color = 1.0 - color;

  if (u_sepiaAmount > 0.0) {
    vec3 sepia = vec3(
      dot(color, vec3(0.393, 0.769, 0.189)),
      dot(color, vec3(0.349, 0.686, 0.168)),
      dot(color, vec3(0.272, 0.534, 0.131))
    );
    color = mix(color, sepia, u_sepiaAmount);
  }

  outColor = vec4(clamp(color, 0.0, 1.0), src.a);
}
`;

export interface ColorParams {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hueDeg?: number;
  invert?: boolean;
  sepiaAmount?: number;
}

export function getColorProgram(gl: WebGL2RenderingContext): GlProgram {
  return getProgram(gl, SHARED_VERTEX_SHADER, FRAGMENT_SHADER);
}

export function applyColor(gl: WebGL2RenderingContext, program: GlProgram, params: ColorParams): void {
  useProgram(gl, program);
  setUniform1i(gl, program, "u_texture", 0);
  setUniform1f(gl, program, "u_brightness", params.brightness ?? 0);
  setUniform1f(gl, program, "u_contrast", params.contrast ?? 1);
  setUniform1f(gl, program, "u_saturation", params.saturation ?? 1);
  setUniform1f(gl, program, "u_hueDeg", params.hueDeg ?? 0);
  setUniform1i(gl, program, "u_invert", params.invert ? 1 : 0);
  setUniform1f(gl, program, "u_sepiaAmount", params.sepiaAmount ?? 0);
}

/** Legacy CSS-filter preset -> ColorParams, for back-compat with the 7
 * existing preset ids (see EFFECT_FILTERS in the old web app compositor). */
export function presetToColorParams(id: string): ColorParams | null {
  switch (id) {
    case "grayscale":
      return { saturation: 0 };
    case "sepia":
      return { sepiaAmount: 1 };
    case "vivid":
      return { saturation: 1.4, contrast: 1.1 };
    case "cool":
      return { hueDeg: -15, saturation: 1.1 };
    case "warm":
      return { hueDeg: 15, saturation: 1.1 };
    case "invert":
      return { invert: true };
    case "vintage":
      return { saturation: 0.7, contrast: 0.9, brightness: 0.05 };
    default:
      return null;
  }
}
