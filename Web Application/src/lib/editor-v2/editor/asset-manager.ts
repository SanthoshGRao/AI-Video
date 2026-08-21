/**
 * Phase 3 — Asset Manager.
 *
 * Tracks every asset across three representations:
 *   - Original  → highest-fidelity source (used by future Export Engine)
 *   - Proxy     → lightweight low-res variant (used by timeline + playback)
 *   - Thumbnail → still preview (used by Asset Panel + timeline strip)
 *
 * The Timeline Engine and Playback Engine only ever read the proxy URL.
 * This is what makes a 500-clip project smooth.
 */

export type AssetStatus =
  | "uploading"
  | "processing"
  | "loading"
  | "ready"
  | "cached"
  | "error";

export type AssetKind = "video" | "image" | "audio";

export interface AssetMetadata {
  duration: number; // seconds
  fps?: number;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
  audioTracks?: number;
  size?: number;
}

export interface AssetRecord {
  assetId: string;
  name: string;
  kind: AssetKind;
  status: AssetStatus;
  /** Original high-fidelity source URL (object URL, http, blob). */
  originalUrl: string;
  /** Optional proxy URL — for the editor and live playback. */
  proxyUrl?: string;
  /** Optional thumbnail data URL or blob URL. */
  thumbnailUrl?: string;
  /** Extracted metadata (duration / fps / dimensions / codec / etc). */
  metadata?: AssetMetadata;
  /** 0..1 processing progress. */
  progress?: number;
  /** Last error message, if any. */
  error?: string;
  /** Timestamps. */
  createdAt: number;
  updatedAt: number;
}

type Listener = (assets: AssetRecord[]) => void;

class AssetManager {
  private map = new Map<string, AssetRecord>();
  private listeners = new Set<Listener>();

  /** Create or replace a record. */
  upsert(a: AssetRecord): AssetRecord {
    const prev = this.map.get(a.assetId);
    const next: AssetRecord = { ...prev, ...a, updatedAt: Date.now() };
    this.map.set(next.assetId, next);
    this.emit();
    return next;
  }

  /** Patch fields. */
  patch(assetId: string, patch: Partial<AssetRecord>): AssetRecord | null {
    const cur = this.map.get(assetId);
    if (!cur) return null;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    this.map.set(assetId, next);
    this.emit();
    return next;
  }

  setStatus(assetId: string, status: AssetStatus, error?: string) {
    return this.patch(assetId, { status, error });
  }

  setProgress(assetId: string, progress: number) {
    return this.patch(assetId, { progress: Math.max(0, Math.min(1, progress)) });
  }

  setMetadata(assetId: string, metadata: AssetMetadata) {
    return this.patch(assetId, { metadata });
  }

  setThumbnail(assetId: string, thumbnailUrl: string) {
    return this.patch(assetId, { thumbnailUrl });
  }

  setProxy(assetId: string, proxyUrl: string) {
    return this.patch(assetId, { proxyUrl });
  }

  get(assetId: string) {
    return this.map.get(assetId) ?? null;
  }

  /** Playback / Timeline read this — prefer proxy, fall back to original. */
  playbackUrl(assetId: string): string | null {
    const a = this.map.get(assetId);
    if (!a) return null;
    return a.proxyUrl ?? a.originalUrl;
  }

  /** Export Engine read this — always original. */
  exportUrl(assetId: string): string | null {
    return this.map.get(assetId)?.originalUrl ?? null;
  }

  all(): AssetRecord[] {
    return Array.from(this.map.values());
  }

  remove(assetId: string) {
    if (this.map.delete(assetId)) this.emit();
  }

  count() {
    return this.map.size;
  }

  countBy(status: AssetStatus) {
    let n = 0;
    for (const a of this.map.values()) if (a.status === status) n++;
    return n;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const snap = this.all();
    for (const fn of this.listeners) fn(snap);
  }

  __reset() {
    this.map.clear();
    this.emit();
  }
}

export const assetManager = new AssetManager();
