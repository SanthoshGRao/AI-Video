/**
 * Reusable GPU resource pools. Acquiring/releasing textures and framebuffers
 * every frame (instead of allocating fresh ones) is what avoids GPU
 * allocation churn under sustained playback/export.
 */

interface PooledTexture extends WebGLTexture {
  __poolKey?: string;
}

export class TexturePool {
  private free = new Map<string, WebGLTexture[]>();
  private inUse = new Set<WebGLTexture>();
  private keyOf = new Map<WebGLTexture, string>();

  constructor(private gl: WebGL2RenderingContext) {}

  private bucketKey(width: number, height: number, internalFormat: number): string {
    return `${width}x${height}:${internalFormat}`;
  }

  acquire(width: number, height: number, internalFormat?: number): WebGLTexture {
    const gl = this.gl;
    const format = internalFormat ?? gl.RGBA8;
    const key = this.bucketKey(width, height, format);
    const bucket = this.free.get(key);
    let texture: WebGLTexture;

    if (bucket && bucket.length > 0) {
      texture = bucket.pop()!;
    } else {
      const created = gl.createTexture();
      if (!created) throw new Error("TexturePool: gl.createTexture() failed");
      texture = created;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    this.inUse.add(texture);
    this.keyOf.set(texture, key);
    return texture;
  }

  release(texture: WebGLTexture): void {
    if (!this.inUse.has(texture)) return;
    this.inUse.delete(texture);
    const key = this.keyOf.get(texture);
    if (!key) return;
    const bucket = this.free.get(key) ?? [];
    bucket.push(texture);
    this.free.set(key, bucket);
  }

  get stats(): { free: number; inUse: number } {
    let free = 0;
    for (const bucket of this.free.values()) free += bucket.length;
    return { free, inUse: this.inUse.size };
  }

  dispose(): void {
    const gl = this.gl;
    for (const bucket of this.free.values()) for (const t of bucket) gl.deleteTexture(t);
    for (const t of this.inUse) gl.deleteTexture(t);
    this.free.clear();
    this.inUse.clear();
    this.keyOf.clear();
  }
}

/**
 * Framebuffers cached 1:1 against pooled textures (keyed by texture identity)
 * so re-acquiring the same texture from the pool reuses its FBO too instead
 * of re-binding a fresh one.
 */
export class FramebufferPool {
  // A strong Map, not a WeakMap: WebGL framebuffer objects are not reclaimed
  // by JS garbage collection, so losing the reference would leak the
  // underlying GPU resource. dispose() explicitly deletes every FBO created.
  private byTexture = new Map<WebGLTexture, WebGLFramebuffer>();

  constructor(private gl: WebGL2RenderingContext) {}

  getOrCreate(texture: WebGLTexture): WebGLFramebuffer {
    const existing = this.byTexture.get(texture);
    if (existing) return existing;

    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("FramebufferPool: gl.createFramebuffer() failed");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`FramebufferPool: incomplete framebuffer (status ${status})`);
    }
    this.byTexture.set(texture, fbo);
    return fbo;
  }

  /** Call when a pooled texture is permanently discarded (not just released
   * back to the pool) so its cached FBO doesn't outlive it. */
  forget(texture: WebGLTexture): void {
    const fbo = this.byTexture.get(texture);
    if (!fbo) return;
    this.gl.deleteFramebuffer(fbo);
    this.byTexture.delete(texture);
  }

  dispose(): void {
    for (const fbo of this.byTexture.values()) this.gl.deleteFramebuffer(fbo);
    this.byTexture.clear();
  }
}
