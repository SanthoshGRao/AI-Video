/**
 * Phase 3 — Media Engine.
 *
 * Orchestrates the entire media pipeline:
 *   - asset registration  → AssetManager
 *   - metadata extraction → metadata-worker.ts (with main-thread fallback)
 *   - thumbnail gen       → thumbnail-worker.ts (with main-thread fallback)
 *   - proxy generation    → main-thread placeholder hook (returns original
 *                           URL today; ready for a future transcode service)
 *   - caching             → IndexedDB cache
 *
 * Single entry point for the rest of the editor. Does not own playback,
 * does not own the timeline, and does not patch the Project.
 */

import { assetManager, type AssetKind, type AssetMetadata, type AssetRecord } from "./asset-manager";
import { cache, STORES, type ThumbnailRecord } from "./cache";
import type { MetadataRequest, MetadataResponse } from "./metadata-worker";
import type { ThumbRequest, ThumbResponse } from "./thumbnail-worker";

interface RegisterInput {
  assetId?: string;
  name: string;
  kind: AssetKind;
  originalUrl: string;
  size?: number;
}

const uid = (p = "asset") =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

class MediaEngine {
  private metaWorker: Worker | null = null;
  private thumbWorker: Worker | null = null;
  private metaPending = new Map<string, (r: MetadataResponse) => void>();
  private thumbPending = new Map<string, (r: ThumbResponse) => void>();
  private blobUrlCache = new Map<string, string>();

  stats = {
    workersAvailable: false,
    metadataExtracted: 0,
    thumbnailsGenerated: 0,
    proxiesGenerated: 0,
    errors: 0,
  };

  /* ------------------------------ workers ------------------------------- */

  private ensureMetaWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    if (this.metaWorker) return this.metaWorker;
    try {
      this.metaWorker = new Worker(new URL("./metadata-worker.ts", import.meta.url), {
        type: "module",
      });
      this.metaWorker.onmessage = (e: MessageEvent<MetadataResponse>) => {
        const fn = this.metaPending.get(e.data.id);
        if (fn) {
          this.metaPending.delete(e.data.id);
          fn(e.data);
        }
      };
      this.stats.workersAvailable = true;
    } catch {
      this.metaWorker = null;
    }
    return this.metaWorker;
  }

  private ensureThumbWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    if (this.thumbWorker) return this.thumbWorker;
    try {
      this.thumbWorker = new Worker(new URL("./thumbnail-worker.ts", import.meta.url), {
        type: "module",
      });
      this.thumbWorker.onmessage = (e: MessageEvent<ThumbResponse>) => {
        const fn = this.thumbPending.get(e.data.id);
        if (fn) {
          this.thumbPending.delete(e.data.id);
          fn(e.data);
        }
      };
      this.stats.workersAvailable = true;
    } catch {
      this.thumbWorker = null;
    }
    return this.thumbWorker;
  }

  /* --------------------------- registration ----------------------------- */

  async register(input: RegisterInput): Promise<AssetRecord> {
    const assetId = input.assetId ?? uid();
    const rec: AssetRecord = {
      assetId,
      name: input.name,
      kind: input.kind,
      status: "processing",
      originalUrl: input.originalUrl,
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    assetManager.upsert(rec);

    // Look up cache first
    const cached = await cache.getAsset(assetId).catch(() => null);
    const thumbCached = await cache.getThumbnail(assetId).catch(() => null);
    if (cached?.metadata) {
      assetManager.setMetadata(assetId, cached.metadata);
    }
    if (thumbCached) {
      assetManager.setThumbnail(assetId, this.blobUrl(assetId, thumbCached.blob));
    }
    if (cached?.metadata && thumbCached) {
      assetManager.setStatus(assetId, "cached");
      assetManager.setProgress(assetId, 1);
      return assetManager.get(assetId)!;
    }

    // Process in parallel — metadata + thumbnail + proxy (lazy)
    void this.processAsset(assetId);
    return assetManager.get(assetId)!;
  }

  private blobUrl(assetId: string, blob: Blob) {
    const prev = this.blobUrlCache.get(assetId);
    if (prev) URL.revokeObjectURL(prev);
    const url = URL.createObjectURL(blob);
    this.blobUrlCache.set(assetId, url);
    return url;
  }

  private async processAsset(assetId: string) {
    const a = assetManager.get(assetId);
    if (!a) return;
    try {
      assetManager.setProgress(assetId, 0.1);
      const meta = await this.extractMetadata(a);
      if (meta) {
        assetManager.setMetadata(assetId, meta);
        this.stats.metadataExtracted++;
      }
      assetManager.setProgress(assetId, 0.5);

      const thumb = await this.generateThumbnail(a).catch(() => null);
      if (thumb) {
        assetManager.setThumbnail(assetId, this.blobUrl(assetId, thumb.blob));
        this.stats.thumbnailsGenerated++;
        const rec: ThumbnailRecord = {
          assetId,
          blob: thumb.blob,
          width: thumb.width,
          height: thumb.height,
          createdAt: Date.now(),
        };
        void cache.putThumbnail(rec);
      }
      assetManager.setProgress(assetId, 0.85);

      // Proxy generation (no transcoder yet — proxy = original URL)
      assetManager.setProxy(assetId, a.originalUrl);
      this.stats.proxiesGenerated++;

      assetManager.setProgress(assetId, 1);
      assetManager.setStatus(assetId, "ready");
      const updated = assetManager.get(assetId)!;
      void cache.putAsset(updated);
    } catch (err) {
      this.stats.errors++;
      assetManager.setStatus(assetId, "error", (err as Error).message);
    }
  }

  /* --------------------------- metadata ------------------------------- */

  private extractMetadata(a: AssetRecord): Promise<AssetMetadata | null> {
    return new Promise((resolve) => {
      const w = this.ensureMetaWorker();
      const id = uid("m");
      const req: MetadataRequest = {
        type: "metadata",
        id,
        assetId: a.assetId,
        url: a.originalUrl,
        kind: a.kind,
      };

      const fallback = () => this.extractMetadataMain(a).then(resolve, () => resolve(null));

      if (!w) return fallback();

      const t = setTimeout(() => {
        this.metaPending.delete(id);
        fallback();
      }, 5000);

      this.metaPending.set(id, (r) => {
        clearTimeout(t);
        if (!r.ok) return fallback();
        // Worker can't get duration for video/audio → fill from main thread
        const partial: AssetMetadata = { duration: 0, ...r.data } as AssetMetadata;
        if ((a.kind === "video" || a.kind === "audio") && !partial.duration) {
          this.extractMetadataMain(a).then(
            (full) => resolve({ ...partial, ...full }),
            () => resolve(partial),
          );
        } else {
          resolve(partial);
        }
      });
      try {
        w.postMessage(req);
      } catch {
        clearTimeout(t);
        this.metaPending.delete(id);
        fallback();
      }
    });
  }

  private extractMetadataMain(a: AssetRecord): Promise<AssetMetadata> {
    if (typeof document === "undefined") return Promise.resolve({ duration: 0 });
    if (a.kind === "image") {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () =>
          resolve({ duration: 0, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ duration: 0 });
        img.src = a.originalUrl;
      });
    }
    const el = document.createElement(a.kind === "video" ? "video" : "audio") as
      | HTMLVideoElement
      | HTMLAudioElement;
    return new Promise<AssetMetadata>((resolve) => {
      const done = () => {
        const m: AssetMetadata = {
          duration: Number.isFinite(el.duration) ? el.duration : 0,
        };
        if (a.kind === "video") {
          m.width = (el as HTMLVideoElement).videoWidth;
          m.height = (el as HTMLVideoElement).videoHeight;
          m.fps = 30; // best-effort default — true fps requires WebCodecs
        }
        resolve(m);
      };
      el.preload = "metadata";
      el.onloadedmetadata = done;
      el.onerror = () => resolve({ duration: 0 });
      el.src = a.originalUrl;
    });
  }

  /* --------------------------- thumbnail ------------------------------ */

  private generateThumbnail(
    a: AssetRecord,
  ): Promise<{ blob: Blob; width: number; height: number } | null> {
    return new Promise((resolve, reject) => {
      // images can be fully workerized
      if (a.kind === "image") {
        const w = this.ensureThumbWorker();
        if (!w) return this.thumbnailMain(a).then(resolve, reject);
        const id = uid("t");
        const req: ThumbRequest = {
          type: "thumb:image",
          id,
          assetId: a.assetId,
          url: a.originalUrl,
          maxSize: 256,
          quality: 0.8,
        };
        const t = setTimeout(() => {
          this.thumbPending.delete(id);
          this.thumbnailMain(a).then(resolve, reject);
        }, 8000);
        this.thumbPending.set(id, (r) => {
          clearTimeout(t);
          if (!r.ok || !r.blob) return this.thumbnailMain(a).then(resolve, reject);
          resolve({ blob: r.blob, width: r.width ?? 0, height: r.height ?? 0 });
        });
        try { w.postMessage(req); } catch {
          clearTimeout(t);
          this.thumbPending.delete(id);
          this.thumbnailMain(a).then(resolve, reject);
        }
        return;
      }
      // video / audio must capture on main thread
      this.thumbnailMain(a).then(resolve, reject);
    });
  }

  private async thumbnailMain(
    a: AssetRecord,
  ): Promise<{ blob: Blob; width: number; height: number } | null> {
    if (typeof document === "undefined") return null;
    if (a.kind === "audio") return null;

    const maxSize = 256;
    if (a.kind === "image") {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const r = img.naturalWidth >= img.naturalHeight ? maxSize / img.naturalWidth : maxSize / img.naturalHeight;
          const w = Math.round(img.naturalWidth * Math.min(1, r));
          const h = Math.round(img.naturalHeight * Math.min(1, r));
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d")?.drawImage(img, 0, 0, w, h);
          c.toBlob((b) => (b ? resolve({ blob: b, width: w, height: h }) : resolve(null)), "image/webp", 0.8);
        };
        img.onerror = () => resolve(null);
        img.src = a.originalUrl;
      });
    }

    // video frame capture at t=1s (or 10% in)
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      const cleanup = () => { try { v.src = ""; v.load(); } catch { /* noop */ } };
      v.onloadeddata = () => {
        const t = Math.min(1, (v.duration || 1) * 0.1);
        const seek = () => {
          try {
            const r = v.videoWidth >= v.videoHeight ? maxSize / v.videoWidth : maxSize / v.videoHeight;
            const w = Math.round(v.videoWidth * Math.min(1, r));
            const h = Math.round(v.videoHeight * Math.min(1, r));
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            c.getContext("2d")?.drawImage(v, 0, 0, w, h);
            c.toBlob((b) => { cleanup(); b ? resolve({ blob: b, width: w, height: h }) : resolve(null); }, "image/webp", 0.8);
          } catch { cleanup(); resolve(null); }
        };
        v.onseeked = seek;
        try { v.currentTime = t; } catch { seek(); }
      };
      v.onerror = () => { cleanup(); resolve(null); };
      v.src = a.originalUrl;
    });
  }

  /* ------------------------------ admin ------------------------------- */

  remove(assetId: string) {
    const url = this.blobUrlCache.get(assetId);
    if (url) {
      URL.revokeObjectURL(url);
      this.blobUrlCache.delete(assetId);
    }
    assetManager.remove(assetId);
    void cache.delete(STORES.assets, assetId);
    void cache.delete(STORES.thumbnails, assetId);
    void cache.delete(STORES.proxies, assetId);
  }

  __reset() {
    for (const u of this.blobUrlCache.values()) URL.revokeObjectURL(u);
    this.blobUrlCache.clear();
    assetManager.__reset();
    this.stats = {
      workersAvailable: this.stats.workersAvailable,
      metadataExtracted: 0,
      thumbnailsGenerated: 0,
      proxiesGenerated: 0,
      errors: 0,
    };
  }

  __disposeWorkers() {
    this.metaWorker?.terminate();
    this.thumbWorker?.terminate();
    this.metaWorker = null;
    this.thumbWorker = null;
  }
}

export const mediaEngine = new MediaEngine();
