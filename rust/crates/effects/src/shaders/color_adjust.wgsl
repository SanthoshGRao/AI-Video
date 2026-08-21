struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    resolution: vec2f,
    direction: vec2f,
    scalars: vec4f,
    scalars2: vec4f,
}

// scalars = [brightness, contrast, saturation, hueDeg], scalars2 = [sepia, invert, _, _]

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

fn hue_to_rgb(p: f32, q: f32, t_in: f32) -> f32 {
    var t = t_in;
    if (t < 0.0) { t = t + 1.0; }
    if (t > 1.0) { t = t - 1.0; }
    if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
    if (t < 1.0 / 2.0) { return q; }
    if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
    return p;
}

fn rgb_to_hsl(c: vec3f) -> vec3f {
    let maxc = max(max(c.r, c.g), c.b);
    let minc = min(min(c.r, c.g), c.b);
    let l = (maxc + minc) * 0.5;
    var h = 0.0;
    var s = 0.0;
    let d = maxc - minc;
    if (d > 0.00001) {
        s = d / (1.0 - abs(2.0 * l - 1.0));
        if (maxc == c.r) {
            // WGSL's `%` is fmod-like (can be negative); GLSL's mod() used by
            // the original shader always returns a non-negative result — use
            // the floor-based form here to match it exactly.
            let raw = (c.g - c.b) / d;
            h = raw - 6.0 * floor(raw / 6.0);
        } else if (maxc == c.g) {
            h = (c.b - c.r) / d + 2.0;
        } else {
            h = (c.r - c.g) / d + 4.0;
        }
        h = h / 6.0;
        if (h < 0.0) { h = h + 1.0; }
    }
    return vec3f(h, s, l);
}

fn hsl_to_rgb(hsl: vec3f) -> vec3f {
    let h = hsl.x;
    let s = hsl.y;
    let l = hsl.z;
    if (s <= 0.00001) {
        return vec3f(l, l, l);
    }
    let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
    let p = 2.0 * l - q;
    return vec3f(
        hue_to_rgb(p, q, h + 1.0 / 3.0),
        hue_to_rgb(p, q, h),
        hue_to_rgb(p, q, h - 1.0 / 3.0),
    );
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let tex = textureSample(input_texture, input_sampler, input.tex_coord);
    var c = tex.rgb;

    let brightness = uniforms.scalars.x;
    let contrast = uniforms.scalars.y;
    let saturation = uniforms.scalars.z;
    let hue_deg = uniforms.scalars.w;
    let sepia = uniforms.scalars2.x;
    let invert = uniforms.scalars2.y;

    c = (c - vec3f(0.5)) * contrast + vec3f(0.5);
    c = c * brightness;

    let lum = dot(c, vec3f(0.299, 0.587, 0.114));
    c = mix(vec3f(lum, lum, lum), c, saturation);

    if (abs(hue_deg) > 0.001) {
        var hsl = rgb_to_hsl(clamp(c, vec3f(0.0), vec3f(1.0)));
        hsl.x = fract(hsl.x + hue_deg / 360.0);
        c = hsl_to_rgb(hsl);
    }

    let sepia_color = vec3f(
        dot(c, vec3f(0.393, 0.769, 0.189)),
        dot(c, vec3f(0.349, 0.686, 0.168)),
        dot(c, vec3f(0.272, 0.534, 0.131)),
    );
    c = mix(c, sepia_color, sepia);
    c = mix(c, vec3f(1.0) - c, invert);

    return vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), tex.a);
}
