/**
 * framebuffer-pool.ts — reusable offscreen render targets (FBO + backing
 * texture) for effect ping-pong passes and transition blending. Acquired
 * per frame, released back to the pool instead of being
 * allocated/destroyed every frame.
 */

export interface FboTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export class FramebufferPool {
  private free: FboTarget[] = [];
  private inUse = new Set<FboTarget>();

  constructor(private gl: WebGL2RenderingContext) {}

  acquire(width: number, height: number): FboTarget {
    const idx = this.free.findIndex((f) => f.width === width && f.height === height);
    const target = idx >= 0 ? this.free.splice(idx, 1)[0] : this.create(width, height);
    this.inUse.add(target);
    return target;
  }

  release(target: FboTarget): void {
    if (!this.inUse.has(target)) return;
    this.inUse.delete(target);
    this.free.push(target);
  }

  releaseAll(): void {
    for (const t of [...this.inUse]) this.release(t);
  }

  private create(width: number, height: number): FboTarget {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to create FBO texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("Failed to create framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
    }

    return { framebuffer, texture, width, height };
  }

  disposeAll(): void {
    this.releaseAll();
    for (const t of this.free) {
      this.gl.deleteFramebuffer(t.framebuffer);
      this.gl.deleteTexture(t.texture);
    }
    this.free = [];
  }
}
