/**
 * transitions-gl.ts — blends two already-composited clip textures (the
 * outgoing and incoming clip, each already effects/transform-applied) on
 * the GPU, driven by the same pairing/progress math ported from the old
 * web app's transition-runtime.ts (see lib/transitions.ts in this
 * package). One shader, branching per transition type — simpler to
 * maintain than 7 separate programs for a handful of cheap branches.
 */

import { SHARED_VERTEX_SHADER } from "./geometry";
import { getProgram, setUniform1f, setUniform1i, useProgram, type GlProgram } from "./context";
import type { TransitionType } from "../../../src/editor/model/types";

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress; // 0..1
uniform int u_type; // 0 fade, 1 zoom, 2 slide, 3 blur(approx via fade), 4 push, 5 wipe, 6 flip

vec4 sampleAt(sampler2D tex, vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(tex, uv);
}

void main() {
  vec4 fromColor = texture(u_from, v_uv);
  vec4 toColor = texture(u_to, v_uv);
  float p = clamp(u_progress, 0.0, 1.0);

  if (u_type == 1) {
    // zoom: outgoing scales up + fades out, incoming scales in from center
    vec2 centered = v_uv - 0.5;
    vec2 fromUv = centered * (1.0 + p * 0.3) + 0.5;
    vec2 toUv = centered * (1.5 - p * 0.5) + 0.5;
    fromColor = sampleAt(u_from, fromUv);
    toColor = sampleAt(u_to, toUv);
    outColor = mix(fromColor, toColor, p);
  } else if (u_type == 2) {
    // slide: incoming slides in from the right over a stationary outgoing clip
    vec2 toUv = v_uv + vec2(1.0 - p, 0.0);
    vec4 incoming = sampleAt(u_to, toUv);
    float mask = step(1.0 - p, v_uv.x);
    outColor = mix(fromColor, incoming, mask);
  } else if (u_type == 4) {
    // push: both slide left together
    vec2 fromUv = v_uv + vec2(p, 0.0);
    vec2 toUv = v_uv + vec2(p - 1.0, 0.0);
    vec4 a = sampleAt(u_from, fromUv);
    vec4 b = sampleAt(u_to, toUv);
    outColor = v_uv.x + p < 1.0 ? a : b;
  } else if (u_type == 5) {
    // wipe: hard-edged left-to-right reveal with a soft feather
    float edge = smoothstep(p - 0.05, p + 0.05, v_uv.x);
    outColor = mix(toColor, fromColor, edge);
  } else if (u_type == 6) {
    // flip: approximate a 3D Y-axis flip via horizontal squeeze + swap at the midpoint
    float midpoint = 0.5;
    if (p < midpoint) {
      float t = p / midpoint;
      float squeeze = 1.0 - t;
      vec2 uv = vec2((v_uv.x - 0.5) / max(squeeze, 0.001) + 0.5, v_uv.y);
      outColor = sampleAt(u_from, uv);
    } else {
      float t = (p - midpoint) / midpoint;
      float squeeze = t;
      vec2 uv = vec2((v_uv.x - 0.5) / max(squeeze, 0.001) + 0.5, v_uv.y);
      outColor = sampleAt(u_to, uv);
    }
  } else {
    // fade (0) and blur (3, approximated as a fade — true directional
    // blur-transition is a Phase-3 refinement) both cross-dissolve.
    outColor = mix(fromColor, toColor, p);
  }
}
`;

const TYPE_INDEX: Record<TransitionType, number> = {
  fade: 0,
  zoom: 1,
  slide: 2,
  blur: 3,
  push: 4,
  wipe: 5,
  flip: 6,
};

export function getTransitionProgram(gl: WebGL2RenderingContext): GlProgram {
  return getProgram(gl, SHARED_VERTEX_SHADER, FRAGMENT_SHADER);
}

export function applyTransition(
  gl: WebGL2RenderingContext,
  program: GlProgram,
  fromUnit: number,
  toUnit: number,
  type: TransitionType,
  progress: number
): void {
  useProgram(gl, program);
  setUniform1i(gl, program, "u_from", fromUnit);
  setUniform1i(gl, program, "u_to", toUnit);
  setUniform1i(gl, program, "u_type", TYPE_INDEX[type]);
  setUniform1f(gl, program, "u_progress", progress);
}
