/**
 * Phase 3 — Thumbnail Worker.
 *
 * Generates thumbnails for image assets entirely in a worker using
 * OffscreenCanvas. For video, a frame must be captured on the main thread
 * (video decode is unavailable in workers without WebCodecs); the worker
 * still handles the resize/encode for any frame ImageBitmap it receives.
 *
 * Never touches the DOM. Never blocks the UI thread.
 */

/// <reference lib="webworker" />

export type ThumbRequest =
  | {
      type: "thumb:image";
      id: string;
      assetId: string;
      url: string;
      maxSize: number;
      quality?: number;
    }
  | {
      type: "thumb:bitmap";
      id: string;
      assetId: string;
      bitmap: ImageBitmap;
      maxSize: number;
      quality?: number;
    };

export type ThumbResponse = {
  type: "thumb:result";
  id: string;
  assetId: string;
  ok: boolean;
  blob?: Blob;
  width?: number;
  height?: number;
  error?: string;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function fit(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { w, h };
  const r = w >= h ? max / w : max / h;
  return { w: Math.round(w * r), h: Math.round(h * r) };
}

async function encode(bmp: ImageBitmap, maxSize: number, quality = 0.8) {
  const { w, h } = fit(bmp.width, bmp.height, maxSize);
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: "image/webp", quality });
  return { blob, w, h };
}

ctx.onmessage = async (e: MessageEvent<ThumbRequest>) => {
  const req = e.data;
  if (!req) return;
  try {
    if (req.type === "thumb:image") {
      const res = await fetch(req.url);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const { blob: out, w, h } = await encode(bmp, req.maxSize, req.quality);
      bmp.close?.();
      const r: ThumbResponse = {
        type: "thumb:result",
        id: req.id,
        assetId: req.assetId,
        ok: true,
        blob: out,
        width: w,
        height: h,
      };
      ctx.postMessage(r);
      return;
    }
    if (req.type === "thumb:bitmap") {
      const { blob: out, w, h } = await encode(req.bitmap, req.maxSize, req.quality);
      req.bitmap.close?.();
      const r: ThumbResponse = {
        type: "thumb:result",
        id: req.id,
        assetId: req.assetId,
        ok: true,
        blob: out,
        width: w,
        height: h,
      };
      ctx.postMessage(r);
      return;
    }
  } catch (err) {
    const r: ThumbResponse = {
      type: "thumb:result",
      id: req.id,
      assetId: req.assetId,
      ok: false,
      error: (err as Error).message,
    };
    ctx.postMessage(r);
  }
};

export {};
