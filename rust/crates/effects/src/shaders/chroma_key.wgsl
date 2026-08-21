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

// scalars = [keyColor.r, keyColor.g, keyColor.b, similarity], scalars2 = [smoothness, _, _, _]

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    let key_color = uniforms.scalars.xyz;
    let similarity = uniforms.scalars.w;
    let smoothness = uniforms.scalars2.x;

    let d = distance(c.rgb, key_color);
    let alpha = smoothstep(similarity, similarity + smoothness + 0.0001, d);
    return vec4f(c.rgb, c.a * alpha);
}
