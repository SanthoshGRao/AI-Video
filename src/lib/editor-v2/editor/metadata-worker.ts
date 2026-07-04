/**
 * Phase 3 — Metadata Worker.
 *
 * Runs inside a Web Worker. Extracts duration / dimensions / fps / size from
 * a media source URL using OffscreenCanvas + fetch HEAD when available, and
 * falls back to lightweight probes otherwise.
 *
 * Workers cannot construct HTMLVideoElement, so for video metadata we rely on
 * the network HEAD (bytes/size) and let the main thread fill duration via the
 * Media Engine if a richer probe is requested. This keeps the worker fast and
 * never blocks the UI thread.
 */

/// <reference lib="webworker" />

export type MetadataRequest = {
  type: "metadata";
  id: string;
  assetId: string;
  url: string;
  kind: "video" | "image" | "audio";
};

export type MetadataResponse = {
  type: "metadata:result";
  id: string;
  assetId: string;
  ok: boolean;
  data?: {
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    codec?: string;
    bitrate?: number;
    audioTracks?: number;
    size?: number;
  };
  error?: string;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

async function probeImage(url: string) {
  // OffscreenCanvas + ImageBitmap is the fastest path in a worker
  const res = await fetch(url);
  const size = Number(res.headers.get("content-length")) || 0;
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const out = { width: bmp.width, height: bmp.height, size, duration: 0 };
  bmp.close?.();
  return out;
}

async function probeNetwork(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const size = Number(res.headers.get("content-length")) || 0;
    const codec = res.headers.get("content-type") ?? undefined;
    return { size, codec };
  } catch {
    return { size: 0 };
  }
}

ctx.onmessage = async (e: MessageEvent<MetadataRequest>) => {
  const req = e.data;
  if (!req || req.type !== "metadata") return;
  try {
    if (req.kind === "image") {
      const data = await probeImage(req.url);
      const r: MetadataResponse = { type: "metadata:result", id: req.id, assetId: req.assetId, ok: true, data };
      ctx.postMessage(r);
      return;
    }
    const net = await probeNetwork(req.url);
    const r: MetadataResponse = {
      type: "metadata:result",
      id: req.id,
      assetId: req.assetId,
      ok: true,
      data: { ...net },
    };
    ctx.postMessage(r);
  } catch (err) {
    const r: MetadataResponse = {
      type: "metadata:result",
      id: req.id,
      assetId: req.assetId,
      ok: false,
      error: (err as Error).message,
    };
    ctx.postMessage(r);
  }
};

export {};
