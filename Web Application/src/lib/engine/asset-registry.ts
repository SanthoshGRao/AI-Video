export type AssetType = "video" | "image" | "audio";

export interface LoadedAsset {
  type: AssetType;
  element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement;
  width?: number;
  height?: number;
  duration?: number;
}

export class AssetRegistry {
  private assets: Map<string, LoadedAsset>;
  private loadingPromises: Map<string, Promise<LoadedAsset>>;
  private host: HTMLDivElement | null = null;

  constructor() {
    this.assets = new Map<string, LoadedAsset>();
    this.loadingPromises = new Map<string, Promise<LoadedAsset>>();
  }

  private ensureHost() {
    if (typeof document === "undefined") return null;
    if (this.host && this.host.isConnected) return this.host;
    const host = document.createElement("div");
    host.setAttribute("data-asset-registry-pool", "");
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.width = "1px";
    host.style.height = "1px";
    host.style.overflow = "hidden";
    host.style.pointerEvents = "none";
    host.style.opacity = "0.01";
    host.style.zIndex = "-9999";
    document.body.appendChild(host);
    this.host = host;
    return host;
  }

  public async loadImage(url: string): Promise<LoadedAsset> {
    if (this.assets.has(url)) return this.assets.get(url)!;
    if (this.loadingPromises.has(url)) return this.loadingPromises.get(url)!;

    const promise = new Promise<LoadedAsset>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          type: "image",
          element: img,
          width: img.width,
          height: img.height,
        });
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });

    this.loadingPromises.set(url, promise);
    try {
      const loaded = await promise;
      this.assets.set(url, loaded);
      return loaded;
    } finally {
      this.loadingPromises.delete(url);
    }
  }

  public async loadAudio(url: string): Promise<LoadedAsset> {
    if (this.assets.has(url)) return this.assets.get(url)!;
    if (this.loadingPromises.has(url)) return this.loadingPromises.get(url)!;

    const promise = new Promise<LoadedAsset>((resolve, reject) => {
      const audio = document.createElement("audio");
      audio.crossOrigin = "anonymous";
      audio.src = url;
      audio.preload = "auto";

      const host = this.ensureHost();
      if (host) {
        host.appendChild(audio);
      }

      audio.onloadedmetadata = () => {
        resolve({
          type: "audio",
          element: audio,
          duration: audio.duration,
        });
      };
      audio.onerror = () => reject(new Error(`Failed to load audio: ${url}`));
    });

    this.loadingPromises.set(url, promise);
    try {
      const loaded = await promise;
      this.assets.set(url, loaded);
      return loaded;
    } finally {
      this.loadingPromises.delete(url);
    }
  }

  public get(url: string): LoadedAsset | undefined {
    return this.assets.get(url);
  }

  public clear() {
    for (const asset of Array.from(this.assets.values())) {
      try {
        asset.element.remove();
      } catch {
        /* noop */
      }
    }
    this.assets.clear();
    this.loadingPromises.clear();
    if (this.host) {
      try {
        this.host.remove();
      } catch {
        /* noop */
      }
      this.host = null;
    }
  }
}

export const assetRegistry = new AssetRegistry();
