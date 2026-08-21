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

// scalars = [intensity, _, _, _]
// texture_a = base (the pre-effect source layer), texture_b = the glow texture being added on top.

@group(0) @binding(0) var texture_a: texture_2d<f32>;
@group(0) @binding(1) var texture_b: texture_2d<f32>;
@group(0) @binding(2) var blend_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let base = textureSample(texture_a, blend_sampler, input.tex_coord);
    let add_color = textureSample(texture_b, blend_sampler, input.tex_coord);
    let intensity = uniforms.scalars.x;
    return vec4f(base.rgb + add_color.rgb * intensity, base.a);
}
