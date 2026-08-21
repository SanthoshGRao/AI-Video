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

// scalars = [threshold, _, _, _]

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    let threshold = uniforms.scalars.x;
    let lum = dot(c.rgb, vec3f(0.299, 0.587, 0.114));
    let m = smoothstep(threshold, threshold + 0.2, lum);
    return vec4f(c.rgb * m, c.a * m);
}
