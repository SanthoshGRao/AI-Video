/**
 * geometry.ts — the single unit quad (-1..1 clip space, 0..1 UV) reused by
 * every shader pass. All effects/transitions/compositing draws are just
 * this quad with a different fragment shader and transform uniform.
 */

const QUAD_VERTS = new Float32Array([
  // x, y, u, v
  -1, -1, 0, 0,
  1, -1, 1, 0,
  -1, 1, 0, 1,
  1, 1, 1, 1,
]);

const quadCache = new WeakMap<WebGL2RenderingContext, WebGLVertexArrayObject>();

// Must match the explicit gl.bindAttribLocation() calls in context.ts's
// getProgram(), which pin every program's a_position/a_uv to these same
// indices regardless of declaration order or which fragment shader it's
// paired with.
const POSITION_LOCATION = 0;
const UV_LOCATION = 1;

export function getQuadVao(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const cached = quadCache.get(gl);
  if (cached) return cached;

  const vao = gl.createVertexArray();
  if (!vao) throw new Error("Failed to create VAO");
  gl.bindVertexArray(vao);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);

  const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(POSITION_LOCATION);
  gl.vertexAttribPointer(POSITION_LOCATION, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(UV_LOCATION);
  gl.vertexAttribPointer(UV_LOCATION, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

  gl.bindVertexArray(null);
  quadCache.set(gl, vao);
  return vao;
}

export function drawQuad(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject): void {
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

export const SHARED_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
