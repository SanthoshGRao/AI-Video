/**
 * GLSL sources. One shared vertex shader handles transform/placement for
 * every draw (avoids per-layer geometry rebuilding); each effect gets its
 * own small fragment shader. Named color effects (grayscale/sepia/vintage/
 * vivid/cool/warm/invert/brightness/contrast/saturation/hue) all reduce to
 * ONE parameterized color-adjust shader rather than one program per name —
 * they're the same operation with different uniform presets (see
 * effect-presets.ts), so a "shader per named effect" would just be the same
 * GLSL compiled N times for no behavioral difference.
 */

export const VERTEX_SHADER = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position; // unit quad, -0.5..0.5
layout(location = 1) in vec2 a_uv;

uniform vec2 u_targetSize;
uniform vec4 u_rect; // x, y, w, h — pixel space, origin top-left, y-down (matches ClipTransform)
uniform float u_rotationRad;
// Crops/offsets the sampled UV range — how "object-fit: cover/contain" is
// implemented (see resolveFitUv() in compositor.ts). Identity (1,1 / 0,0)
// samples the whole source, unmodified.
uniform vec2 u_uvScale;
uniform vec2 u_uvOffset;

out vec2 v_uv;

void main() {
  vec2 center = u_rect.xy + u_rect.zw * 0.5;
  float c = cos(u_rotationRad);
  float s = sin(u_rotationRad);
  vec2 local = a_position * u_rect.zw;
  vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 pixelPos = center + rotated;

  vec2 clip = (pixelPos / u_targetSize) * 2.0 - 1.0;
  clip.y = -clip.y; // pixel space is y-down; clip space is y-up
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_uv * u_uvScale + u_uvOffset;
}
`;

/** Used for both the plain passthrough composite pass and as the base for
 * every fragment shader below (they all sample u_tex at v_uv). */
const FRAGMENT_HEADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_opacity;
out vec4 outColor;
`;

export const FRAGMENT_PASSTHROUGH = /* glsl */ `${FRAGMENT_HEADER}
void main() {
  vec4 c = texture(u_tex, v_uv);
  // Straight (non-premultiplied) alpha throughout this module — only alpha
  // carries opacity, rgb stays the "true" color. The compositor's blend
  // func (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) does the opacity-weighting at
  // blend time; scaling rgb by u_opacity here too would double-apply it.
  outColor = vec4(c.rgb, c.a * u_opacity);
}
`;

export const FRAGMENT_COLOR_ADJUST = /* glsl */ `${FRAGMENT_HEADER}
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_hueDeg;
uniform float u_sepia;
uniform float u_invert;

vec3 rgb2hsl(vec3 c) {
  float maxc = max(max(c.r, c.g), c.b);
  float minc = min(min(c.r, c.g), c.b);
  float l = (maxc + minc) * 0.5;
  float h = 0.0;
  float s = 0.0;
  float d = maxc - minc;
  if (d > 0.00001) {
    s = d / (1.0 - abs(2.0 * l - 1.0));
    if (maxc == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (maxc == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
    if (h < 0.0) h += 1.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;
  if (s <= 0.00001) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(
    hue2rgb(p, q, h + 1.0 / 3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0 / 3.0)
  );
}

void main() {
  vec4 tex = texture(u_tex, v_uv);
  vec3 c = tex.rgb;

  c = (c - 0.5) * u_contrast + 0.5;
  c = c * u_brightness;

  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(lum), c, u_saturation);

  if (abs(u_hueDeg) > 0.001) {
    vec3 hsl = rgb2hsl(clamp(c, 0.0, 1.0));
    hsl.x = fract(hsl.x + u_hueDeg / 360.0);
    c = hsl2rgb(hsl);
  }

  vec3 sepiaColor = vec3(
    dot(c, vec3(0.393, 0.769, 0.189)),
    dot(c, vec3(0.349, 0.686, 0.168)),
    dot(c, vec3(0.272, 0.534, 0.131))
  );
  c = mix(c, sepiaColor, u_sepia);
  c = mix(c, vec3(1.0) - c, u_invert);

  outColor = vec4(clamp(c, 0.0, 1.0), tex.a * u_opacity);
}
`;

/** One direction per draw call (horizontal pass, then vertical pass) — a
 * separable gaussian is two 1D passes instead of one expensive 2D kernel. */
export const FRAGMENT_BLUR = /* glsl */ `${FRAGMENT_HEADER}
uniform vec2 u_direction; // texel step * radius, e.g. (radiusPx / width, 0)

void main() {
  vec4 sum = vec4(0.0);
  float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  sum += texture(u_tex, v_uv) * weights[0];
  for (int i = 1; i < 5; i++) {
    vec2 offset = u_direction * float(i);
    sum += texture(u_tex, v_uv + offset) * weights[i];
    sum += texture(u_tex, v_uv - offset) * weights[i];
  }
  outColor = vec4(sum.rgb, sum.a * u_opacity);
}
`;

export const FRAGMENT_VIGNETTE = /* glsl */ `${FRAGMENT_HEADER}
uniform float u_strength; // 0..1

void main() {
  vec4 c = texture(u_tex, v_uv);
  float dist = length(v_uv - 0.5) * 1.4142135;
  float vig = 1.0 - u_strength * smoothstep(0.3, 0.95, dist);
  outColor = vec4(c.rgb * vig, c.a * u_opacity);
}
`;

export const FRAGMENT_CHROMA_KEY = /* glsl */ `${FRAGMENT_HEADER}
uniform vec3 u_keyColor;
uniform float u_similarity;
uniform float u_smoothness;

void main() {
  vec4 c = texture(u_tex, v_uv);
  float d = distance(c.rgb, u_keyColor);
  float alpha = smoothstep(u_similarity, u_similarity + u_smoothness + 0.0001, d);
  outColor = vec4(c.rgb, c.a * alpha * u_opacity);
}
`;

/** Extracts bright areas above a luminance threshold — the first of two
 * passes that make up "glow" (this, then a blur pass, then additive blend
 * in the compositor; see compositor.ts). */
export const FRAGMENT_BRIGHT_PASS = /* glsl */ `${FRAGMENT_HEADER}
uniform float u_threshold;

void main() {
  vec4 c = texture(u_tex, v_uv);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float m = smoothstep(u_threshold, u_threshold + 0.2, lum);
  outColor = vec4(c.rgb * m, c.a * m * u_opacity);
}
`;

/** Additively blends a second texture (e.g. a blurred bright-pass) on top of
 * u_tex — the final step of the two-pass "glow" effect (bright-pass -> blur
 * -> add), see compositor.ts. */
export const FRAGMENT_ADD_BLEND = /* glsl */ `${FRAGMENT_HEADER}
uniform sampler2D u_texB;
uniform float u_intensity;

void main() {
  vec4 base = texture(u_tex, v_uv);
  vec4 addColor = texture(u_texB, v_uv);
  outColor = vec4(base.rgb + addColor.rgb * u_intensity, base.a * u_opacity);
}
`;

/** Cube LUT sample from a single-row tile strip: the image is `size*size`
 * pixels wide by `size` tall, laid out as `size` tiles left-to-right (one
 * per B slice), each tile `size x size` px covering the R (x) / G (y) plane
 * for that slice. This is the common "LUT strip" format used by most
 * preset packs (as opposed to a square NxN grid of tiles, which only makes
 * sense when there are more slices than fit in one row). */
export const FRAGMENT_LUT = /* glsl */ `${FRAGMENT_HEADER}
uniform sampler2D u_lut;
uniform float u_lutSize;

vec3 applyLut(vec3 color, float size) {
  float bz = floor(color.b * (size - 1.0));
  float bz2 = min(bz + 1.0, size - 1.0);

  float rOffset = (color.r * (size - 1.0) + 0.5) / size;
  float gOffset = (color.g * (size - 1.0) + 0.5) / size;

  vec2 texPos1 = vec2((bz + rOffset) / size, gOffset);
  vec2 texPos2 = vec2((bz2 + rOffset) / size, gOffset);

  vec3 c1 = texture(u_lut, texPos1).rgb;
  vec3 c2 = texture(u_lut, texPos2).rgb;
  return mix(c1, c2, fract(color.b * (size - 1.0)));
}

void main() {
  vec4 c = texture(u_tex, v_uv);
  outColor = vec4(applyLut(c.rgb, u_lutSize), c.a * u_opacity);
}
`;
