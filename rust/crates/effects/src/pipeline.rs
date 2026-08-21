use std::collections::HashMap;

use bytemuck::{Pod, Zeroable};
use gpu::{FULLSCREEN_SHADER_SOURCE, GpuContext};
use thiserror::Error;
use wgpu::util::DeviceExt;

use crate::{EffectPass, UniformValue};

const GAUSSIAN_BLUR_SHADER_ID: &str = "gaussian-blur";
const GAUSSIAN_BLUR_SHADER_SOURCE: &str = include_str!("shaders/gaussian_blur.wgsl");
const COLOR_ADJUST_SHADER_ID: &str = "color-adjust";
const COLOR_ADJUST_SHADER_SOURCE: &str = include_str!("shaders/color_adjust.wgsl");
const VIGNETTE_SHADER_ID: &str = "vignette";
const VIGNETTE_SHADER_SOURCE: &str = include_str!("shaders/vignette.wgsl");
const CHROMA_KEY_SHADER_ID: &str = "chroma-key";
const CHROMA_KEY_SHADER_SOURCE: &str = include_str!("shaders/chroma_key.wgsl");
const BRIGHT_PASS_SHADER_ID: &str = "bright-pass";
const BRIGHT_PASS_SHADER_SOURCE: &str = include_str!("shaders/bright_pass.wgsl");
/// Not registered in `pipelines` — handled by a dedicated two-texture
/// pipeline/bind-group-layout in `apply_with_encoder`, since every other
/// shader here only ever samples one input texture.
const ADD_BLEND_SHADER_ID: &str = "add-blend";
const ADD_BLEND_SHADER_SOURCE: &str = include_str!("shaders/add_blend.wgsl");

pub struct ApplyEffectsOptions<'a> {
    pub source: &'a wgpu::Texture,
    pub width: u32,
    pub height: u32,
    pub passes: &'a [EffectPass],
}

pub struct EffectPipeline {
    uniform_bind_group_layout: wgpu::BindGroupLayout,
    two_texture_bind_group_layout: wgpu::BindGroupLayout,
    pipelines: HashMap<String, wgpu::RenderPipeline>,
    add_blend_pipeline: wgpu::RenderPipeline,
}

#[derive(Debug, Error)]
pub enum EffectsError {
    #[error("At least one effect pass is required")]
    MissingEffectPasses,
    #[error("Unknown effect shader '{shader}'")]
    UnknownEffectShader { shader: String },
    #[error("Missing uniform '{uniform}' for shader '{shader}'")]
    MissingUniform { shader: String, uniform: String },
    #[error("Uniform '{uniform}' for shader '{shader}' must be a number")]
    InvalidNumberUniform { shader: String, uniform: String },
    #[error(
        "Uniform '{uniform}' for shader '{shader}' must be a vector of length {expected_length}"
    )]
    InvalidVectorUniform {
        shader: String,
        uniform: String,
        expected_length: usize,
    },
    #[error("Shader '{shader}' does not support uniform '{uniform}'")]
    UnsupportedUniform { shader: String, uniform: String },
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct EffectUniformBuffer {
    resolution: [f32; 2],
    direction: [f32; 2],
    scalars: [f32; 4],
    scalars2: [f32; 4],
}

impl EffectPipeline {
    pub fn new(context: &GpuContext) -> Self {
        let uniform_bind_group_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("effects-uniform-bind-group-layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    }],
                });
        let two_texture_bind_group_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("effects-two-texture-bind-group-layout"),
                    entries: &[
                        wgpu::BindGroupLayoutEntry {
                            binding: 0,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                multisampled: false,
                                view_dimension: wgpu::TextureViewDimension::D2,
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 1,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                multisampled: false,
                                view_dimension: wgpu::TextureViewDimension::D2,
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 2,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                            count: None,
                        },
                    ],
                });
        let vertex_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-fullscreen-shader"),
                    source: wgpu::ShaderSource::Wgsl(FULLSCREEN_SHADER_SOURCE.into()),
                });
        let pipeline_layout =
            context
                .device()
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("effects-pipeline-layout"),
                    bind_group_layouts: &[
                        Some(context.texture_sampler_bind_group_layout()),
                        Some(&uniform_bind_group_layout),
                    ],
                    immediate_size: 0,
                });
        let two_texture_pipeline_layout =
            context
                .device()
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("effects-two-texture-pipeline-layout"),
                    bind_group_layouts: &[
                        Some(&two_texture_bind_group_layout),
                        Some(&uniform_bind_group_layout),
                    ],
                    immediate_size: 0,
                });

        let single_texture_shaders: [(&str, &str, &str); 5] = [
            (GAUSSIAN_BLUR_SHADER_ID, "effects-gaussian-blur", GAUSSIAN_BLUR_SHADER_SOURCE),
            (COLOR_ADJUST_SHADER_ID, "effects-color-adjust", COLOR_ADJUST_SHADER_SOURCE),
            (VIGNETTE_SHADER_ID, "effects-vignette", VIGNETTE_SHADER_SOURCE),
            (CHROMA_KEY_SHADER_ID, "effects-chroma-key", CHROMA_KEY_SHADER_SOURCE),
            (BRIGHT_PASS_SHADER_ID, "effects-bright-pass", BRIGHT_PASS_SHADER_SOURCE),
        ];

        let mut pipelines = HashMap::new();
        for (shader_id, label, source) in single_texture_shaders {
            let shader_module =
                context
                    .device()
                    .create_shader_module(wgpu::ShaderModuleDescriptor {
                        label: Some(label),
                        source: wgpu::ShaderSource::Wgsl(source.into()),
                    });
            let pipeline = context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some(label),
                    layout: Some(&pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
            pipelines.insert(shader_id.to_string(), pipeline);
        }

        let add_blend_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-add-blend"),
                    source: wgpu::ShaderSource::Wgsl(ADD_BLEND_SHADER_SOURCE.into()),
                });
        let add_blend_pipeline =
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("effects-add-blend"),
                    layout: Some(&two_texture_pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &add_blend_shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });

        Self {
            uniform_bind_group_layout,
            two_texture_bind_group_layout,
            pipelines,
            add_blend_pipeline,
        }
    }

    pub fn apply(
        &self,
        context: &GpuContext,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut encoder =
            context
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("effects-command-encoder"),
                });
        let output = self.apply_with_encoder(
            context,
            &mut encoder,
            ApplyEffectsOptions {
                source,
                width,
                height,
                passes,
            },
        )?;
        context.queue().submit([encoder.finish()]);
        Ok(output)
    }

    pub fn apply_with_encoder(
        &self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut current_texture: Option<wgpu::Texture> = None;

        for pass in passes {
            let uniform_buffer =
                context
                    .device()
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("effects-uniform-buffer"),
                        contents: bytemuck::bytes_of(&pack_effect_uniforms(pass, width, height)?),
                        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    });
            let uniform_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-uniform-bind-group"),
                        layout: &self.uniform_bind_group_layout,
                        entries: &[wgpu::BindGroupEntry {
                            binding: 0,
                            resource: uniform_buffer.as_entire_binding(),
                        }],
                    });

            let output_texture =
                context.create_render_texture(width, height, "effects-pass-output");
            let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

            if pass.shader == ADD_BLEND_SHADER_ID {
                // Glow's final step: blend the accumulated (bright-pass ->
                // blur -> blur) texture back onto the ORIGINAL pre-effects
                // source, not the previous pass's output — see add_blend.wgsl.
                let texture_a = source;
                let texture_b = current_texture.as_ref().unwrap_or(source);
                let view_a = texture_a.create_view(&wgpu::TextureViewDescriptor::default());
                let view_b = texture_b.create_view(&wgpu::TextureViewDescriptor::default());
                let texture_bind_group =
                    context
                        .device()
                        .create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some("effects-two-texture-bind-group"),
                            layout: &self.two_texture_bind_group_layout,
                            entries: &[
                                wgpu::BindGroupEntry {
                                    binding: 0,
                                    resource: wgpu::BindingResource::TextureView(&view_a),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 1,
                                    resource: wgpu::BindingResource::TextureView(&view_b),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 2,
                                    resource: wgpu::BindingResource::Sampler(
                                        context.linear_sampler(),
                                    ),
                                },
                            ],
                        });

                let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("effects-add-blend-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &output_view,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    occlusion_query_set: None,
                    timestamp_writes: None,
                    multiview_mask: None,
                });
                render_pass.set_pipeline(&self.add_blend_pipeline);
                render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
                render_pass.set_bind_group(0, &texture_bind_group, &[]);
                render_pass.set_bind_group(1, &uniform_bind_group, &[]);
                render_pass.draw(0..6, 0..1);
            } else {
                let input_texture = current_texture.as_ref().unwrap_or(source);
                let input_view =
                    input_texture.create_view(&wgpu::TextureViewDescriptor::default());
                let texture_bind_group =
                    context
                        .device()
                        .create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some("effects-texture-bind-group"),
                            layout: context.texture_sampler_bind_group_layout(),
                            entries: &[
                                wgpu::BindGroupEntry {
                                    binding: 0,
                                    resource: wgpu::BindingResource::TextureView(&input_view),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 1,
                                    resource: wgpu::BindingResource::Sampler(
                                        context.linear_sampler(),
                                    ),
                                },
                            ],
                        });
                let pipeline = self.pipelines.get(&pass.shader).ok_or_else(|| {
                    EffectsError::UnknownEffectShader {
                        shader: pass.shader.clone(),
                    }
                })?;

                let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("effects-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &output_view,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    occlusion_query_set: None,
                    timestamp_writes: None,
                    multiview_mask: None,
                });
                render_pass.set_pipeline(pipeline);
                render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
                render_pass.set_bind_group(0, &texture_bind_group, &[]);
                render_pass.set_bind_group(1, &uniform_bind_group, &[]);
                render_pass.draw(0..6, 0..1);
            }

            current_texture = Some(output_texture);
        }

        current_texture.ok_or(EffectsError::MissingEffectPasses)
    }
}

fn pack_effect_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let shader = pass.shader.as_str();

    let allowed: &[&str] = match shader {
        s if s == GAUSSIAN_BLUR_SHADER_ID => &["u_sigma", "u_step", "u_direction"],
        s if s == COLOR_ADJUST_SHADER_ID => &[
            "u_brightness",
            "u_contrast",
            "u_saturation",
            "u_hueDeg",
            "u_sepia",
            "u_invert",
        ],
        s if s == VIGNETTE_SHADER_ID => &["u_strength"],
        s if s == CHROMA_KEY_SHADER_ID => &["u_keyColor", "u_similarity", "u_smoothness"],
        s if s == BRIGHT_PASS_SHADER_ID => &["u_threshold"],
        s if s == ADD_BLEND_SHADER_ID => &["u_intensity"],
        _ => {
            return Err(EffectsError::UnknownEffectShader {
                shader: shader.to_string(),
            });
        }
    };
    for uniform in pass.uniforms.keys() {
        if !allowed.contains(&uniform.as_str()) {
            return Err(EffectsError::UnsupportedUniform {
                shader: shader.to_string(),
                uniform: uniform.clone(),
            });
        }
    }

    let mut buffer = EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction: [0.0, 0.0],
        scalars: [0.0; 4],
        scalars2: [0.0; 4],
    };

    match shader {
        s if s == GAUSSIAN_BLUR_SHADER_ID => {
            buffer.scalars[0] = read_number_uniform(pass, "u_sigma")?;
            buffer.scalars[1] = read_number_uniform(pass, "u_step")?;
            buffer.direction = read_vec2_uniform(pass, "u_direction")?;
        }
        s if s == COLOR_ADJUST_SHADER_ID => {
            buffer.scalars[0] = read_number_uniform(pass, "u_brightness")?;
            buffer.scalars[1] = read_number_uniform(pass, "u_contrast")?;
            buffer.scalars[2] = read_number_uniform(pass, "u_saturation")?;
            buffer.scalars[3] = read_number_uniform(pass, "u_hueDeg")?;
            buffer.scalars2[0] = read_number_uniform(pass, "u_sepia")?;
            buffer.scalars2[1] = read_number_uniform(pass, "u_invert")?;
        }
        s if s == VIGNETTE_SHADER_ID => {
            buffer.scalars[0] = read_number_uniform(pass, "u_strength")?;
        }
        s if s == CHROMA_KEY_SHADER_ID => {
            let key_color = read_vec3_uniform(pass, "u_keyColor")?;
            buffer.scalars[0] = key_color[0];
            buffer.scalars[1] = key_color[1];
            buffer.scalars[2] = key_color[2];
            buffer.scalars[3] = read_number_uniform(pass, "u_similarity")?;
            buffer.scalars2[0] = read_number_uniform(pass, "u_smoothness")?;
        }
        s if s == BRIGHT_PASS_SHADER_ID => {
            buffer.scalars[0] = read_number_uniform(pass, "u_threshold")?;
        }
        s if s == ADD_BLEND_SHADER_ID => {
            buffer.scalars[0] = read_number_uniform(pass, "u_intensity")?;
        }
        _ => unreachable!("validated by `allowed` match above"),
    }

    Ok(buffer)
}

fn read_number_uniform(pass: &EffectPass, uniform: &str) -> Result<f32, EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    match value {
        UniformValue::Number(value) => Ok(*value),
        UniformValue::Vector(_) => Err(EffectsError::InvalidNumberUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        }),
    }
}

fn read_vec2_uniform(pass: &EffectPass, uniform: &str) -> Result<[f32; 2], EffectsError> {
    let values = read_vector_uniform(pass, uniform, 2)?;
    Ok([values[0], values[1]])
}

fn read_vec3_uniform(pass: &EffectPass, uniform: &str) -> Result<[f32; 3], EffectsError> {
    let values = read_vector_uniform(pass, uniform, 3)?;
    Ok([values[0], values[1], values[2]])
}

fn read_vector_uniform(
    pass: &EffectPass,
    uniform: &str,
    expected_length: usize,
) -> Result<Vec<f32>, EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    let UniformValue::Vector(values) = value else {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length,
        });
    };
    if values.len() != expected_length {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length,
        });
    }
    Ok(values.clone())
}
