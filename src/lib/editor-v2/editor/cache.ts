/**
 * Phase 3 — IndexedDB Cache.
 *
 * Versioned, typed key/value store for:
 *   - asset metadata
 *   - thumbnails (blobs)
 *   - proxy references
 *   - project snapshots
 *
 * Pure storage layer. No DOM, no React. Safe in SSR (falls back to in-memory).
 */

import type { AssetMetadata, AssetRecord } from "./asset-manager";

export const CACHE_DB_NAME = "saas_studio_cache";
export const CACHE_DB_VERSION = 1;

export const STORES = {
  assets: "assets",
  thumbnails: "thumbnails",
  proxies: "proxies",
  projects: "projects",
} as const;

export interface ThumbnailRecord {
  assetId: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
}

export interface ProxyRecord {
  assetId: string;
  url: string;
  width: number;
  height: number;
  bitrate?: number;
  createdAt: number;
}

export interface ProjectSnapshotRecord {
  id: string;
  name: string;
  version: number;
  payload: string; // serialized JSON
  updatedAt: number;
}

interface MemoryStore {
  [key: string]: Map<string, unknown>;
}

class Cache {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memory: MemoryStore = {};
  public stats = {
    hits: 0,
    misses: 0,
    writes: 0,
    bytes: 0,
  };

  private hasIDB() {
    return typeof indexedDB !== "undefined";
  }

  private mem(store: string): Map<string, unknown> {
    if (!this.memory[store]) this.memory[store] = new Map();
    return this.memory[store];
  }

  private async db(): Promise<IDBDatabase> {
    if (!this.hasIDB()) throw new Error("indexedDB unavailable");
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: name === "projects" ? "id" : "assetId" });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async put<T>(store: string, value: T): Promise<void> {
    this.stats.writes++;
    if (value && typeof value === "object" && "blob" in (value as Record<string, unknown>)) {
      const blob = (value as { blob?: Blob }).blob;
      if (blob) this.stats.bytes += blob.size;
    }
    if (!this.hasIDB()) {
      const k = (value as { assetId?: string; id?: string }).assetId
        ?? (value as { id?: string }).id ?? "";
      this.mem(store).set(k, value);
      return;
    }
    try {
      const db = await this.db();
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value as unknown as IDBValidKey extends never ? never : object);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch {
      const k = (value as { assetId?: string; id?: string }).assetId
        ?? (value as { id?: string }).id ?? "";
      this.mem(store).set(k, value);
    }
  }

  async get<T>(store: string, key: string): Promise<T | null> {
    if (!this.hasIDB()) {
      const v = this.mem(store).get(key);
      if (v) { this.stats.hits++; return v as T; }
      this.stats.misses++;
      return null;
    }
    try {
      const db = await this.db();
      const v = await new Promise<T | null>((res, rej) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => res((req.result as T) ?? null);
        req.onerror = () => rej(req.error);
      });
      if (v) this.stats.hits++; else this.stats.misses++;
      return v;
    } catch {
      this.stats.misses++;
      return null;
    }
  }

  async delete(store: string, key: string): Promise<void> {
    if (!this.hasIDB()) {
      this.mem(store).delete(key);
      return;
    }
    try {
      const db = await this.db();
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch {
      this.mem(store).delete(key);
    }
  }

  async all<T>(store: string): Promise<T[]> {
    if (!this.hasIDB()) return Array.from(this.mem(store).values()) as T[];
    try {
      const db = await this.db();
      return await new Promise<T[]>((res, rej) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => res((req.result as T[]) ?? []);
        req.onerror = () => rej(req.error);
      });
    } catch {
      return Array.from(this.mem(store).values()) as T[];
    }
  }

  async clear(store?: string): Promise<void> {
    const targets = store ? [store] : Object.values(STORES);
    if (!this.hasIDB()) {
      for (const s of targets) this.mem(s).clear();
      return;
    }
    try {
      const db = await this.db();
      await Promise.all(
        targets.map(
          (s) =>
            new Promise<void>((res, rej) => {
              const tx = db.transaction(s, "readwrite");
              tx.objectStore(s).clear();
              tx.oncomplete = () => res();
              tx.onerror = () => rej(tx.error);
            }),
        ),
      );
    } catch {
      for (const s of targets) this.mem(s).clear();
    }
    this.stats = { hits: 0, misses: 0, writes: 0, bytes: 0 };
  }

  // Typed convenience wrappers
  putAsset = (a: AssetRecord) => this.put(STORES.assets, a);
  getAsset = (id: string) => this.get<AssetRecord>(STORES.assets, id);
  putMetadata = (assetId: string, meta: AssetMetadata) =>
    this.put(STORES.assets, { assetId, ...meta } as unknown as AssetRecord);
  putThumbnail = (t: ThumbnailRecord) => this.put(STORES.thumbnails, t);
  getThumbnail = (id: string) => this.get<ThumbnailRecord>(STORES.thumbnails, id);
  putProxy = (p: ProxyRecord) => this.put(STORES.proxies, p);
  getProxy = (id: string) => this.get<ProxyRecord>(STORES.proxies, id);
  putProject = (s: ProjectSnapshotRecord) => this.put(STORES.projects, s);
  getProject = (id: string) => this.get<ProjectSnapshotRecord>(STORES.projects, id);
}

export const cache = new Cache();
