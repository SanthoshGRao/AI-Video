/**
 * Adapts the existing preview render plan (`buildCanvasRenderPlan`, already
 * the "what's active right now" resolver used by the DOM stage) into
 * `ResolvedLayer[]` for the GPU compositor. Only image/video StageElements
 * are handled here — text/subtitle/sticker/shape content stays DOM-rendered
 * on top of the canvas (see canvas-stage.tsx), so this is a partial,
 * intentionally-scoped bridge, not the full Phase 1 render graph.
 *
 * Known limitations (documented, not silent):
 *  - Transition slide/zoom position/clip effects (`transitionStyle.transform`
 *    /`clipPath`) are not reproduced — only the opacity component is
 *    applied. Layers just crossfade in place during a transition.
 *  - Images are loaded into a plain module-level cache; a not-yet-loaded
 *    image is skipped for that frame (self-heals next frame once loaded).
 */
import { mediaPool } from "./media-pool";
import { clipLayerPriority } from "@/lib/editor-v2/layer-priority";
import { presetEffectStep } from "@/lib/gpu-compositor/effect-presets";
import type { ResolvedLayer, EffectStep } from "@/lib/gpu-compositor/types";
import type { CanvasRenderItem } from "./render-pipeline-debug";
import type { EffectId } from "@/lib/editor-v2/editor-store";

const imageCache = new Map<string, HTMLImageElement>();

/** Returns the cached image only once it's actually decoded — starts loading
 * it (once) otherwise. Callers should skip the layer until this returns
 * non-null; the next render plan tick will pick it up once loaded. */
function getLoadedImage(src: string): HTMLImageElement | null {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = src;
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function effectSteps(effect: EffectId | null | undefined): EffectStep[] | undefined {
  if (!effect || effect === "none") return undefined;
  return [presetEffectStep(effect)];
}

export function renderPlanToGpuLayers(
  items: CanvasRenderItem[],
  stageW: number,
  stageH: number,
): ResolvedLayer[] {
  if (!stageW || !stageH) return [];

  const eligible = items.filter(
    (item) => item.element.kind === "image" || item.element.kind === "video",
  );
  // Canvas draws back-to-front in array order — match the same paint order
  // the DOM stage uses (video < image < overlay < ...), see layer-priority.ts.
  eligible.sort((a, b) => clipLayerPriority(a.clip.kind) - clipLayerPriority(b.clip.kind));

  const layers: ResolvedLayer[] = [];

  for (const item of eligible) {
    const el = item.element;
    const ts = item.transitionStyle;
    const baseOpacity = (el.opacity ?? 100) / 100;
    const opacity = ts?.opacity != null ? baseOpacity * ts.opacity : baseOpacity;
    if (opacity <= 0) continue;

    const transform = {
      x: (el.x / 100) * stageW,
      y: (el.y / 100) * stageH,
      w: (el.w / 100) * stageW,
      h: (el.h / 100) * stageH,
      rotation: el.rotation,
      opacity,
    };

    if (el.kind === "video") {
      const mediaEl = mediaPool.get(item.clip.id);
      if (!mediaEl || mediaEl.tagName !== "VIDEO") continue;
      const videoEl = mediaEl as HTMLVideoElement;
      if (videoEl.readyState < 2) continue; // HAVE_CURRENT_DATA — nothing decoded to sample yet
      layers.push({
        clipId: item.clip.id,
        source: videoEl,
        sourceIsTexture: false,
        transform,
        fit: el.fit ?? "cover",
        effects: effectSteps(el.effect),
      });
    } else if (el.kind === "image" && el.src) {
      const img = getLoadedImage(el.src);
      if (!img) continue;
      layers.push({
        clipId: item.clip.id,
        source: img,
        sourceIsTexture: false,
        transform,
        fit: el.fit ?? "cover",
        effects: effectSteps(el.effect),
      });
    }
  }

  return layers;
}

/** Whether canvas-stage.tsx should route image/video content through the GPU
 * compositor instead of DOM `<img>`/`<video>`. NEXT_PUBLIC_* is inlined at
 * build time — see desktop-app-architecture memory note on this gotcha. */
export const GPU_PREVIEW_ENABLED = process.env.NEXT_PUBLIC_GPU_PREVIEW === "true";
