/**
 * texture-pool.ts — reusable WebGL textures keyed by clip id, so decoding
 * a video/image frame into a GPU texture doesn't allocate a new
 * WebGLTexture every animation frame (the original ask's "memory pool"
 * item — avoid creating new buffers every frame).
 */

export class TexturePool {
  private textures = new Map<string, WebGLTexture>();

  constructor(private gl: WebGL2RenderingContext) {}

  private getOrCreate(key: string): WebGLTexture {
    let tex = this.textures.get(key);
    if (!tex) {
      const gl = this.gl;
      const created = gl.createTexture();
      if (!created) throw new Error("Failed to create texture");
      tex = created;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.textures.set(key, tex);
    }
    return tex;
  }

  /** Uploads a video/image/canvas frame into the texture owned by `key`. */
  uploadSource(key: string, source: TexImageSource): WebGLTexture {
    const gl = this.gl;
    const tex = this.getOrCreate(key);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return tex;
  }

  get(key: string): WebGLTexture | undefined {
    return this.textures.get(key);
  }

  release(key: string): void {
    const tex = this.textures.get(key);
    if (tex) {
      this.gl.deleteTexture(tex);
      this.textures.delete(key);
    }
  }

  /** Frees textures for clips no longer on/near the timeline window. */
  releaseUnused(activeKeys: ReadonlySet<string>): void {
    for (const key of [...this.textures.keys()]) {
      if (!activeKeys.has(key)) this.release(key);
    }
  }

  dispose(): void {
    for (const tex of this.textures.values()) this.gl.deleteTexture(tex);
    this.textures.clear();
  }
}
