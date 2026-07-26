/**
 * frame-cache.ts — LRU-ish cache of a clip's fully processed (resized +
 * effects-chain-applied) local-space texture, keyed on
 * (clipId, editVersion) where editVersion hashes the clip's own
 * transform+effects+trim AND, for video, the currently-decoded frame
 * time. While paused (a very common state while editing — user stops to
 * adjust the properties panel), the same clip is re-requested every
 * animation-frame tick with an unchanged editVersion, so this turns what
 * would otherwise be redundant resize+effects GPU passes every frame into
 * a cache hit — the concrete "recalculates everything for every frame"
 * complaint this whole redesign exists to fix.
 */

import type { NativeClip } from "../../../src/editor/model/types";
import type { FramebufferPool, FboTarget } from "./framebuffer-pool";

interface Entry {
  editVersion: string;
  target: FboTarget;
  lastUsedFrame: number;
}

export class FrameCache {
  private entries = new Map<string, Entry>();
  private frame = 0;
  private hits = 0;
  private misses = 0;

  constructor(private fboPool: FramebufferPool) {}

  beginFrame(): void {
    this.frame++;
  }

  get(clipId: string, editVersion: string): FboTarget | null {
    const entry = this.entries.get(clipId);
    if (!entry || entry.editVersion !== editVersion) {
      this.misses++;
      return null;
    }
    entry.lastUsedFrame = this.frame;
    this.hits++;
    return entry.target;
  }

  /** Hit rate over the process lifetime (0..1) — cheap running counters,
   * not a windowed average, so it settles quickly and stays stable. */
  getStats(): { hits: number; misses: number; hitRate: number; entryCount: number } {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, hitRate: total > 0 ? this.hits / total : 0, entryCount: this.entries.size };
  }

  set(clipId: string, editVersion: string, target: FboTarget): void {
    const existing = this.entries.get(clipId);
    if (existing && existing.target !== target) this.fboPool.release(existing.target);
    this.entries.set(clipId, { editVersion, target, lastUsedFrame: this.frame });
  }

  /** Frees cache entries for clips no longer active/nearby — call once per frame with the current active id set. */
  evict(activeIds: ReadonlySet<string>, maxAgeFrames = 120): void {
    for (const [clipId, entry] of this.entries) {
      if (!activeIds.has(clipId) || this.frame - entry.lastUsedFrame > maxAgeFrames) {
        this.fboPool.release(entry.target);
        this.entries.delete(clipId);
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.fboPool.release(entry.target);
    this.entries.clear();
  }
}

/** Hashes the parts of a clip that affect its rendered local-space
 * texture — transform, effects, trim — NOT its timeline position
 * (startSec/endSec moving doesn't change what the clip looks like). */
export function hashClipRenderParams(clip: NativeClip, videoFrameTimeSec: number | null): string {
  const t = clip.transform;
  const parts = [
    clip.kind,
    t ? `${Math.round(t.w)}x${Math.round(t.h)}r${t.rotationDeg}o${t.opacity.toFixed(3)}` : "notransform",
    JSON.stringify(clip.effects),
    clip.fit ?? "",
    videoFrameTimeSec !== null ? `t${videoFrameTimeSec.toFixed(2)}` : "static",
  ];
  return parts.join("|");
}
