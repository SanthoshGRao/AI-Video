/**
 * Phase 3 — Scene Preloader.
 *
 * Keeps the current, previous, and next scenes' media warm so seeking
 * across scenes is instant. Uses HTMLMediaElement preload + ImageBitmap
 * decode for images. Pure side-effect module; no UI state.
 */

import { assetManager } from "./asset-manager";
import type { ProjectSec, Scene } from "./types";

interface PreloadStats {
  scenes: number;
  assets: number;
  hits: number;
  misses: number;
}

class Preloader {
  private warmed = new Map<string, HTMLMediaElement | HTMLImageElement>();
  private warmedSceneIds = new Set<string>();
  stats: PreloadStats = { scenes: 0, assets: 0, hits: 0, misses: 0 };

  preloadForScene(project: ProjectSec, activeSceneId: string) {
    if (typeof document === "undefined") return;
    const order = [...project.scenes].sort((a, b) => a.order - b.order);
    const idx = order.findIndex((s) => s.id === activeSceneId);
    if (idx < 0) return;

    const targets: Scene[] = [];
    if (order[idx - 1]) targets.push(order[idx - 1]);
    targets.push(order[idx]);
    if (order[idx + 1]) targets.push(order[idx + 1]);

    const nextSceneIds = new Set(targets.map((s) => s.id));

    // GC out-of-window scenes
    for (const sid of Array.from(this.warmedSceneIds)) {
      if (!nextSceneIds.has(sid)) {
        this.warmedSceneIds.delete(sid);
      }
    }

    const wantedSrcs = new Set<string>();
    for (const s of targets) {
      const sceneClips = project.clips.filter((c) => c.sceneId === s.id);
      for (const c of sceneClips) if (c.src) wantedSrcs.add(c.src);
      this.warmedSceneIds.add(s.id);
    }

    // Drop warmed entries we no longer need
    for (const src of Array.from(this.warmed.keys())) {
      if (!wantedSrcs.has(src)) {
        const el = this.warmed.get(src);
        if (el && "src" in el) (el as HTMLMediaElement).src = "";
        this.warmed.delete(src);
      }
    }

    // Preload missing ones
    for (const src of wantedSrcs) {
      if (this.warmed.has(src)) {
        this.stats.hits++;
        continue;
      }
      this.stats.misses++;
      this.warm(src);
    }

    this.stats.scenes = this.warmedSceneIds.size;
    this.stats.assets = this.warmed.size;
  }

  private warm(src: string) {
    try {
      // Prefer asset kind if we have an asset record matching src
      const known = assetManager.all().find((a) => a.originalUrl === src || a.proxyUrl === src);
      const kind = known?.kind;
      if (kind === "image") {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        this.warmed.set(src, img);
        return;
      }
      const el = document.createElement(kind === "audio" ? "audio" : "video") as
        | HTMLAudioElement
        | HTMLVideoElement;
      el.preload = "auto";
      if (el instanceof HTMLVideoElement) el.muted = true;
      el.src = src;
      this.warmed.set(src, el);
    } catch {
      /* noop */
    }
  }

  warmedCount() {
    return this.warmed.size;
  }

  preloadedSceneIds() {
    return Array.from(this.warmedSceneIds);
  }

  __reset() {
    for (const el of this.warmed.values()) {
      if ("src" in el) (el as HTMLMediaElement).src = "";
    }
    this.warmed.clear();
    this.warmedSceneIds.clear();
    this.stats = { scenes: 0, assets: 0, hits: 0, misses: 0 };
  }
}

export const preloader = new Preloader();
