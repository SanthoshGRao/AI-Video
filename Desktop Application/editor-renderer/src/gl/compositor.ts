/**
 * compositor.ts — the Phase 2 GPU preview renderer, replacing the Phase 1
 * DOM/CSS compositing in CanvasStage.tsx. Per clip: decode source ->
 * resize into a clip-local FBO -> run the effects chain (in local space,
 * so vignette/chromaKey/etc. are relative to the clip's own box, not the
 * whole canvas) -> composite into a canvas-sized layer at the clip's
 * transform -> alpha-over onto the backbuffer in track order. Transition
 * pairs render both clips as canvas-sized layers and blend them via
 * transitions-gl.ts before compositing as one draw at the right z order.
 */

import type { NativeClip, NativeProject, TransitionType } from "../../../src/editor/model/types";
import { createGlContext } from "./context";
import { drawQuad, getQuadVao } from "./geometry";
import { TexturePool } from "./texture-pool";
import { FramebufferPool, type FboTarget } from "./framebuffer-pool";
import { createEffectPrograms, applyEffectsChain, type EffectPrograms } from "./effects-chain";
import { getCompositeProgram, applyComposite } from "./effects/composite";
import { getTransitionProgram, applyTransition } from "./transitions-gl";
import { TextTextureCache } from "./text-texture-cache";
import { clipBoxToNdc, identity, type Mat3 } from "./mat3";
import { transitionAtPlayhead } from "../lib/transitions";
import { FrameCache, hashClipRenderParams } from "./frame-cache";

export interface FrameSourceEntry {
  source: TexImageSource;
  /** Current decode time for video sources (drives frame-cache
   * invalidation) — null for images/static sources. */
  timeSec: number | null;
}

export interface FrameSources {
  /** Decoded video/image frame per clip id, ready for texImage2D upload. */
  get(clipId: string): FrameSourceEntry | undefined;
}

export class GlCompositor {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private texturePool: TexturePool;
  private fboPool: FramebufferPool;
  private effectPrograms: EffectPrograms;
  private compositeProgram: ReturnType<typeof getCompositeProgram>;
  private transitionProgram: ReturnType<typeof getTransitionProgram>;
  private textCache: TextTextureCache;
  private frameCache: FrameCache;
  private vao: WebGLVertexArrayObject;
  private lastRenderMs = 0;
  private lastFrameAt = 0;
  private instantFps = 0;

  constructor(canvas: HTMLCanvasElement) {
    const { gl } = createGlContext(canvas);
    this.gl = gl;
    this.canvas = canvas;
    this.texturePool = new TexturePool(gl);
    this.fboPool = new FramebufferPool(gl);
    this.effectPrograms = createEffectPrograms(gl);
    this.compositeProgram = getCompositeProgram(gl);
    this.transitionProgram = getTransitionProgram(gl);
    this.textCache = new TextTextureCache(gl);
    this.frameCache = new FrameCache(this.fboPool);
    this.vao = getQuadVao(gl);
  }

  resizeCanvas(pixelWidth: number, pixelHeight: number): void {
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
  }

  /** Renders one frame of `project` at `playheadSec` using whatever decoded
   * frame sources are currently available (video/image elements the caller
   * keeps in sync — see CanvasStage.tsx). */
  renderFrame(project: NativeProject, playheadSec: number, sources: FrameSources): void {
    const frameStart = performance.now();
    if (this.lastFrameAt > 0) {
      const delta = frameStart - this.lastFrameAt;
      if (delta > 0) this.instantFps = 1000 / delta;
    }
    this.lastFrameAt = frameStart;

    const gl = this.gl;
    const W = project.width;
    const H = project.height;

    this.textCache.beginFrame();
    this.frameCache.beginFrame();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const transitionPair = transitionAtPlayhead(project, playheadSec);
    const skipIds = new Set<string>();
    if (transitionPair) {
      skipIds.add(transitionPair.outgoing.id);
      skipIds.add(transitionPair.incoming.id);
    }

    const trackOrder = new Map(project.tracks.map((t) => [t.id, t.order]));
    type DrawItem = { order: number; run: () => void };
    const items: DrawItem[] = [];

    for (const clip of project.clips) {
      if (clip.startSec > playheadSec || playheadSec >= clip.endSec) continue;
      if (clip.kind === "audio") continue;
      if (skipIds.has(clip.id)) continue;
      const order = trackOrder.get(clip.trackId) ?? 0;

      if (clip.kind === "text" || clip.kind === "subtitle") {
        items.push({ order, run: () => this.compositeTextDirect(clip, W, H) });
      } else {
        items.push({ order, run: () => this.compositeClipDirect(clip, sources, W, H) });
      }
    }

    if (transitionPair) {
      const order = trackOrder.get(transitionPair.outgoing.trackId) ?? 0;
      items.push({
        order,
        run: () =>
          this.compositeTransition(
            transitionPair.outgoing,
            transitionPair.incoming,
            transitionPair.transition.type,
            transitionPair.progress,
            sources,
            W,
            H
          ),
      });
    }

    items.sort((a, b) => a.order - b.order);
    for (const item of items) item.run();

    const nearIds = new Set(project.clips.filter((c) => this.isNear(c, playheadSec)).map((c) => c.id));
    this.texturePool.releaseUnused(nearIds);
    this.frameCache.evict(nearIds);
    this.textCache.evictStale();

    this.lastRenderMs = performance.now() - frameStart;
  }

  /** Snapshot of preview performance — read by the dev perf overlay
   * (see PerfOverlay.tsx). Not exposed anywhere in production UI. */
  getStats() {
    const cacheStats = this.frameCache.getStats();
    return {
      lastRenderMs: this.lastRenderMs,
      instantFps: this.instantFps,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      cacheHitRate: cacheStats.hitRate,
      cachedLayers: cacheStats.entryCount,
    };
  }

  private isNear(clip: NativeClip, playheadSec: number): boolean {
    return clip.startSec - 2 <= playheadSec && playheadSec <= clip.endSec + 2;
  }

  /** Resize a decoded source into a clip-local FBO, run its effects chain,
   * return the final local-space texture (caller composites; ownership
   * stays with the frame cache, so callers must NOT release `out.target`
   * themselves — see the `cached` flag). */
  private renderClipLocal(
    clip: NativeClip,
    sources: FrameSources,
    out: { target: FboTarget | null; cached: boolean }
  ): WebGLTexture | null {
    const entry = sources.get(clip.id);
    if (!entry) return null;

    const editVersion = hashClipRenderParams(clip, entry.timeSec);
    const cached = this.frameCache.get(clip.id, editVersion);
    if (cached) {
      out.target = cached;
      out.cached = true;
      return cached.texture;
    }

    const w = Math.max(2, Math.round(clip.transform?.w ?? 100));
    const h = Math.max(2, Math.round(clip.transform?.h ?? 100));

    const rawTexture = this.texturePool.uploadSource(clip.id, entry.source);

    const resized = this.fboPool.acquire(w, h);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, resized.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rawTexture);
    applyComposite(gl, this.compositeProgram, null, 1);
    drawQuad(gl, this.vao);

    let finalTarget: FboTarget;
    if (clip.effects.length === 0) {
      finalTarget = resized;
    } else {
      const effected = applyEffectsChain(gl, this.fboPool, this.effectPrograms, resized.texture, w, h, clip.effects);
      this.fboPool.release(resized);
      finalTarget = effected.owned ?? resized;
    }

    this.frameCache.set(clip.id, editVersion, finalTarget);
    out.target = finalTarget;
    out.cached = true;
    return finalTarget.texture;
  }

  /** Composites a clip straight onto whatever framebuffer is currently bound. */
  private compositeClipDirect(clip: NativeClip, sources: FrameSources, canvasW: number, canvasH: number): void {
    const gl = this.gl;
    const holder: { target: FboTarget | null; cached: boolean } = { target: null, cached: false };
    const texture = this.renderClipLocal(clip, sources, holder);
    if (!texture) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const matrix = clip.transform ? clipBoxToNdc(clip.transform, canvasW, canvasH) : identity();
    applyComposite(gl, this.compositeProgram, matrix, clip.transform?.opacity ?? 1);
    drawQuad(gl, this.vao);
    // Note: holder.target is owned by the frame cache now — not released here.
  }

  private compositeTextDirect(clip: NativeClip, canvasW: number, canvasH: number): void {
    if (!clip.text?.content) return;
    const gl = this.gl;
    const t = clip.transform ?? { x: 0, y: 0, w: canvasW, h: canvasH * 0.2, rotationDeg: 0, opacity: 1 };
    const texture = this.textCache.getOrRender(clip.text.content, clip.text.style ?? {}, t.w, t.h);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const matrix = clipBoxToNdc(t, canvasW, canvasH);
    applyComposite(gl, this.compositeProgram, matrix, t.opacity);
    drawQuad(gl, this.vao);
  }

  /** Renders a clip into a canvas-sized transparent layer (position/effects
   * baked in) — used for transition blending, where both textures must
   * share the same full-canvas coordinate space (transitions-gl.ts). */
  private renderClipToCanvasLayer(clip: NativeClip, sources: FrameSources, canvasW: number, canvasH: number): FboTarget {
    const gl = this.gl;
    const holder: { target: FboTarget | null; cached: boolean } = { target: null, cached: false };
    const localTexture = this.renderClipLocal(clip, sources, holder);

    const layer = this.fboPool.acquire(canvasW, canvasH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    gl.viewport(0, 0, canvasW, canvasH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (localTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, localTexture);
      const matrix: Mat3 = clip.transform ? clipBoxToNdc(clip.transform, canvasW, canvasH) : identity();
      applyComposite(gl, this.compositeProgram, matrix, clip.transform?.opacity ?? 1);
      drawQuad(gl, this.vao);
    }
    // Note: holder.target (localTexture's owner) is owned by the frame cache — not released here.
    return layer;
  }

  private compositeTransition(
    outgoing: NativeClip,
    incoming: NativeClip,
    type: TransitionType,
    progress: number,
    sources: FrameSources,
    canvasW: number,
    canvasH: number
  ): void {
    const gl = this.gl;
    const fromLayer = this.renderClipToCanvasLayer(outgoing, sources, canvasW, canvasH);
    const toLayer = this.renderClipToCanvasLayer(incoming, sources, canvasW, canvasH);

    const blended = this.fboPool.acquire(canvasW, canvasH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blended.framebuffer);
    gl.viewport(0, 0, canvasW, canvasH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fromLayer.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, toLayer.texture);
    applyTransition(gl, this.transitionProgram, 0, 1, type, progress);
    drawQuad(gl, this.vao);

    this.fboPool.release(fromLayer);
    this.fboPool.release(toLayer);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, blended.texture);
    applyComposite(gl, this.compositeProgram, identity(), 1);
    drawQuad(gl, this.vao);

    this.fboPool.release(blended);
  }

  dispose(): void {
    this.frameCache.dispose();
    this.texturePool.dispose();
    this.fboPool.disposeAll();
    this.textCache.dispose();
  }
}
