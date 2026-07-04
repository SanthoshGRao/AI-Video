import { assetRegistry } from "./asset-registry";
import useStore from "../../_designcombo/editor/store/use-store";

type PlaybackState = "playing" | "paused";
type RenderCallback = (timeMs: number) => void;

class PlaybackEngine {
  private state: PlaybackState = "paused";
  private currentTimeMs: number = 0;
  private lastRafTime: number = 0;
  private rafId: number | null = null;
  private durationMs: number = 1000;
  private fps: number = 30;

  private renderCallbacks: Set<RenderCallback> = new Set();
  
  // Track last time we synced the React store to avoid excessive updates
  private lastStoreSyncTime = 0;

  constructor() {
    this.tick = this.tick.bind(this);
  }

  public init(durationMs: number, fps: number) {
    this.durationMs = durationMs;
    this.fps = fps;
  }

  public onRender(callback: RenderCallback) {
    this.renderCallbacks.add(callback);
    // Trigger immediate render
    callback(this.currentTimeMs);
    return () => this.renderCallbacks.delete(callback);
  }

  public play() {
    if (this.state === "playing") return;
    if (this.currentTimeMs >= this.durationMs) {
      this.seek(0);
    }
    this.state = "playing";
    this.lastRafTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
    
    useStore.getState().setState({ playbackState: "playing" });
  }

  public pause() {
    if (this.state === "paused") return;
    this.state = "paused";
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    // Pause all media elements
    this.pauseAllMedia();
    useStore.getState().setState({ playbackState: "paused" });
  }

  public seek(timeMs: number) {
    this.currentTimeMs = Math.max(0, Math.min(timeMs, this.durationMs));
    this.syncMediaElements();
    this.triggerRender();
    this.syncStore(true);
  }

  public getCurrentTime() {
    return this.currentTimeMs;
  }
  
  public getState() {
    return this.state;
  }

  private tick(timestamp: number) {
    if (this.state !== "playing") return;

    const delta = timestamp - this.lastRafTime;
    this.lastRafTime = timestamp;

    this.currentTimeMs += delta;

    if (this.currentTimeMs >= this.durationMs) {
      this.currentTimeMs = this.durationMs;
      this.pause();
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }

    this.syncMediaElements();
    this.triggerRender();
    this.syncStore();
  }

  private triggerRender() {
    for (const cb of Array.from(this.renderCallbacks)) {
      cb(this.currentTimeMs);
    }
  }

  private syncMediaElements() {
    // This is called constantly during playback and seek.
    // We only want to play videos that are supposed to be active,
    // and seek them if they drift.
    
    const store = useStore.getState();
    const activeItems = (Object.values(store.trackItemsMap) as any[]).filter(item => {
      const start = item.display?.from ?? 0;
      const end = item.display?.to ?? store.duration;
      return this.currentTimeMs >= start && this.currentTimeMs <= end;
    });

    const activeUrls = new Set(activeItems.map((i: any) => i.details?.src).filter(Boolean));

    // For all assets in the registry, if they are video/audio
    // we manage their play state.
    // To do this properly without scanning the entire registry, we should just iterate active items.
    
    for (const item of activeItems) {
      if (item.type !== "video" && item.type !== "audio") continue;
      
      const src = item.details?.src;
      if (!src) continue;
      
      const asset = assetRegistry.get(src);
      if (!asset || (asset.type !== "video" && asset.type !== "audio")) continue;

      const media = asset.element as HTMLVideoElement | HTMLAudioElement;
      
      const itemStart = item.display?.from ?? 0;
      const trimStart = item.trim?.from ?? 0;
      
      // Calculate local media time
      const mediaTimeMs = trimStart + (this.currentTimeMs - itemStart);
      const mediaTimeSec = mediaTimeMs / 1000;

      if (this.state === "playing") {
        if (media.paused) {
          media.currentTime = mediaTimeSec;
          media.play().catch(() => {});
        } else {
          // Check for drift (more than 100ms)
          if (Math.abs(media.currentTime - mediaTimeSec) > 0.1) {
            media.currentTime = mediaTimeSec;
          }
        }
      } else {
        if (!media.paused) {
          media.pause();
        }
        media.currentTime = mediaTimeSec;
      }
    }
    
    // Pause anything that is NOT active
    // This requires a registry method to get all media
    assetRegistry.getAllMedia().forEach(media => {
      if (!activeUrls.has(media.src) && !media.paused) {
        media.pause();
      }
    });
  }

  private pauseAllMedia() {
    assetRegistry.getAllMedia().forEach(media => {
      if (!media.paused) media.pause();
    });
  }

  private syncStore(force = false) {
    // Only update React state 10 times a second to prevent UI lag
    if (force || performance.now() - this.lastStoreSyncTime > 100) {
      useStore.getState().setState({ currentTime: this.currentTimeMs });
      this.lastStoreSyncTime = performance.now();
    }
  }
}

export const playbackEngine = new PlaybackEngine();
