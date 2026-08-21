/**
 * Phase 1 — Media Element Pool.
 *
 * Reusable HTMLMediaElement pool keyed by clip id. The Media Sync Controller
 * attaches/detaches/seeks/resumes elements based on the active clip set.
 *
 * Goals:
 *   - No duplicate <video>/<audio> per clip
 *   - No ghost playback (inactive clips are paused + muted)
 *   - Hidden DOM container holds inactive elements
 */

export type MediaKind = "video" | "audio";

export interface PoolEntry {
  el: HTMLMediaElement;
  kind: MediaKind;
  src: string;
  inUse: boolean;
  lastUsed: number;
}

class MediaPool {
  private entries = new Map<string, PoolEntry>();
  private host: HTMLDivElement | null = null;

  private ensureHost() {
    if (typeof document === "undefined") return null;
    if (this.host && this.host.isConnected) return this.host;
    const host = document.createElement("div");
    host.setAttribute("data-media-pool", "");
    host.style.position = "fixed";
    host.style.left = "-99999px";
    host.style.top = "0";
    host.style.width = "1px";
    host.style.height = "1px";
    host.style.overflow = "hidden";
    host.style.pointerEvents = "none";
    host.style.opacity = "0";
    document.body.appendChild(host);
    this.host = host;
    return host;
  }

  acquire(clipId: string, kind: MediaKind, src: string): HTMLMediaElement | null {
    const host = this.ensureHost();
    if (!host) return null;
    let entry = this.entries.get(clipId);
    if (entry && entry.src !== src) {
      // src changed — recycle
      this.release(clipId);
      entry = undefined;
    }
    if (!entry) {
      const el: HTMLMediaElement =
        kind === "video" ? document.createElement("video") : document.createElement("audio");
      el.preload = "auto";
      if (kind === "video") {
        (el as HTMLVideoElement).playsInline = true;
      }
      el.src = src;
      host.appendChild(el);
      entry = { el, kind, src, inUse: false, lastUsed: performance.now() };
      this.entries.set(clipId, entry);
    }
    entry.inUse = true;
    entry.lastUsed = performance.now();
    return entry.el;
  }

  release(clipId: string) {
    const entry = this.entries.get(clipId);
    if (!entry) return;
    try {
      entry.el.pause();
      entry.el.removeAttribute("src");
      entry.el.load();
      entry.el.remove();
    } catch {
      /* noop */
    }
    this.entries.delete(clipId);
  }

  markInactive(clipId: string) {
    const e = this.entries.get(clipId);
    if (!e) return;
    e.inUse = false;
    try {
      if (!e.el.paused) e.el.pause();
    } catch {
      /* noop */
    }
  }

  get(clipId: string) {
    return this.entries.get(clipId)?.el ?? null;
  }

  all() {
    return Array.from(this.entries.entries());
  }

  size() {
    return this.entries.size;
  }

  /** Drop pool entries not present in the keep set. */
  gc(keep: Set<string>) {
    for (const id of Array.from(this.entries.keys())) {
      if (!keep.has(id)) this.release(id);
    }
  }

  __reset() {
    for (const id of Array.from(this.entries.keys())) this.release(id);
    if (this.host && this.host.isConnected) this.host.remove();
    this.host = null;
  }
}

export const mediaPool = new MediaPool();
