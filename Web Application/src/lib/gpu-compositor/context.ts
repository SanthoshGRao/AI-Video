import { TexturePool, FramebufferPool } from "./texture-pool";

export interface GpuContext {
  gl: WebGL2RenderingContext;
  /** Unit quad (-0.5..0.5 position, 0..1 uv), shared by every draw call —
   * per-layer placement happens via uniforms in the vertex shader, not by
   * rebuilding geometry. */
  quadVao: WebGLVertexArrayObject;
  texturePool: TexturePool;
  framebufferPool: FramebufferPool;
  programCache: Map<string, WebGLProgram>;
  dispose: () => void;
}

export function createGpuContext(canvas: HTMLCanvasElement | OffscreenCanvas): GpuContext {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    // Every shader here does color math and blending in straight (not
    // premultiplied) alpha — matching this attribute to false tells the
    // browser to treat the canvas's own straight-alpha output correctly
    // when compositing it over the page/DOM, instead of expecting
    // premultiplied values and producing dark fringing on transparent edges.
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: true, // export/verification reads pixels back after draw
  }) as WebGL2RenderingContext | null;

  if (!gl) throw new Error("createGpuContext: WebGL2 is not available in this environment");

  const quadVao = createQuadVao(gl);
  const texturePool = new TexturePool(gl);
  const framebufferPool = new FramebufferPool(gl);
  const programCache = new Map<string, WebGLProgram>();

  const dispose = () => {
    texturePool.dispose();
    framebufferPool.dispose();
    for (const program of programCache.values()) gl.deleteProgram(program);
    programCache.clear();
    gl.deleteVertexArray(quadVao);
  };

  return { gl, quadVao, texturePool, framebufferPool, programCache, dispose };
}

function createQuadVao(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("createQuadVao: gl.createVertexArray() failed");
  gl.bindVertexArray(vao);

  // Triangle strip: (x, y, u, v) per vertex.
  //
  // VERTEX_SHADER places the quad in y-DOWN pixel space (u_rect's origin is
  // top-left), so a_position.y = -0.5 is the rect's TOP edge and must sample
  // the texture's TOP row (v = 0). Textures uploaded via texImage2D put the
  // source's first row at v = 0, so this pairing is the identity.
  //
  // This used to pair -0.5 with v = 1, which drew every layer's *content*
  // upside down in the framebuffer. That flip happened to cancel against
  // gl.readPixels' bottom-up row order, so exported *pixels* looked right —
  // but only the content cancelled, not the placement: an element at y = 6%
  // of the canvas was read back at 94%. A full-bleed video layer spans the
  // whole canvas and so hid the error completely; it only became visible
  // once text layers (which occupy small boxes) were composited here.
  // prettier-ignore
  const verts = new Float32Array([
    -0.5, -0.5, 0, 0,
     0.5, -0.5, 1, 0,
    -0.5,  0.5, 0, 1,
     0.5,  0.5, 1, 1,
  ]);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(0); // a_position
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1); // a_uv
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return vao;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("compileShader: gl.createShader() failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error (${type === gl.VERTEX_SHADER ? "vertex" : "fragment"}): ${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("linkProgram: gl.createProgram() failed");
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

/** Compiles once per (ctx, key) and caches — shader programs are expensive
 * to build and are never per-frame state, so they're keyed by a stable
 * string (e.g. the effect id) rather than recompiled on every draw. */
export function getOrCompileProgram(
  ctx: GpuContext,
  key: string,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const cached = ctx.programCache.get(key);
  if (cached) return cached;
  const program = linkProgram(ctx.gl, vertSrc, fragSrc);
  ctx.programCache.set(key, program);
  return program;
}
