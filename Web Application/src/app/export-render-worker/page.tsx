"use client";

export const dynamic = "force-dynamic";

/**
 * export-render-worker — headless page loaded into a hidden Electron
 * BrowserWindow by the desktop app's export engine (see
 * "Desktop Application/src/editor/export/render-window.ts"). It hosts a
 * compositor and renders one export frame per `export-render:frame` IPC
 * message, replying with raw RGBA bytes.
 *
 * Not a live preview: every frame this renders is fully specified by the
 * caller (pre-decoded layer pixels + transform + effects) so the same input
 * always produces the same output, independent of playback state.
 *
 * ## Engine choice (WebGL2 by default, not the Rust/wgpu WASM compositor)
 *
 * Both backends composite correctly, but only the WebGL2 one is a good fit
 * for *offscreen export in a hidden window*:
 *
 *  - Readback is a synchronous `gl.readPixels` from a `preserveDrawingBuffer`
 *    context — the pixels are available the moment the draw calls are
 *    issued, with no dependency on the page being composited.
 *  - The WASM path can only be read back through its presentation canvas
 *    (`getCompositorCanvas()` → `drawImage` → `getImageData`), which costs
 *    two extra full-frame copies *and* requires waiting a `requestAnimationFrame`
 *    tick for the presented surface to become visible to `drawImage`. In a
 *    `show: false` BrowserWindow the page is `document.hidden`, so rAF is
 *    not driven by vsync and that wait is unbounded — it was the single
 *    largest per-frame stall in the export, and a hidden window that never
 *    presents can also yield blank readbacks.
 *
 * The WASM compositor stays available (and is still the right engine for an
 * on-screen preview) via `?engine=wasm`; it will need a direct
 * texture→buffer readback export on the Rust side before it can be the
 * export default.
 */
import { useEffect, useRef } from "react";
import { GpuCompositor } from "@/lib/gpu-compositor/compositor";
import type { WasmCompositor, WasmLayerInput } from "@/lib/gpu-compositor/wasm-compositor";
import {
  presetEffectStep,
  brightnessEffect,
  contrastEffect,
  saturationEffect,
  hueEffect,
  blurEffect,
  vignetteEffect,
  chromaKeyEffect,
  glowEffect,
} from "@/lib/gpu-compositor/effect-presets";
import type { EffectStep, ResolvedLayer, EffectId } from "@/lib/gpu-compositor/types";
import { resolveTextStyle, type StoredTextStyle, type TextKind } from "@/lib/text/text-style";
import { renderTextLayer, type TextWord } from "@/lib/text/text-renderer";
import { loadFullFont } from "@/fonts/google-fonts";

interface WireEffect {
  type: string;
  amount?: number;
  radiusPx?: number;
  strength?: number;
  color?: string;
  tolerance?: number;
  id?: string;
}

interface WireText {
  content: string;
  kind: TextKind;
  style: StoredTextStyle;
  words?: TextWord[];
  timeMs?: number;
}

interface WireLayer {
  clipId: string;
  /** Text layers are rasterised here with the shared renderer rather than
   * arriving as pixels — see renderTextSource(). */
  text?: WireText;
  /** Raw RGBA bytes, top row first, already scaled to srcWidth x srcHeight
   * by the desktop app's ffmpeg decode pipeline (video clips). */
  rgba?: Uint8Array<ArrayBuffer>;
  /** Encoded image-file bytes (still-image clips). */
  encoded?: Uint8Array<ArrayBuffer>;
  srcWidth?: number;
  srcHeight?: number;
  mimeType?: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  rotationDeg: number;
  opacity: number;
  fit: "cover" | "contain" | "fill";
  effects: WireEffect[];
  /** Wipe-transition reveal: fraction of the layer cropped from each edge,
   *  0-100. Both the sampled source and the destination box are narrowed by
   *  this, so the layer is revealed rather than squashed. */
  cropInsetPct?: { left: number; right: number };
}

/** Non-zero crop fractions for `layer`, or null when there is nothing to crop. */
function cropFractions(layer: WireLayer): { left: number; right: number; kept: number } | null {
  const c = layer.cropInsetPct;
  if (!c) return null;
  const left = Math.max(0, Math.min(100, c.left)) / 100;
  const right = Math.max(0, Math.min(100, c.right)) / 100;
  const kept = 1 - left - right;
  if (left <= 0 && right <= 0) return null;
  return { left, right, kept };
}

interface FrameRequest {
  id: number;
  width: number;
  height: number;
  background: string;
  layers: WireLayer[];
}

interface ExportBridge {
  ready(engine: string): void;
  onFrame(handler: (request: FrameRequest) => Promise<Uint8Array>): void;
  log(level: "info" | "warn", message: string): void;
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [0, 1, 0];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

/** The frame's clear colour. Alpha is forced to 1: an export frame is
 * opaque video, and leaving uncovered regions transparent made the encoder
 * receive alpha=0 pixels whose RGB nobody had ever written — i.e. black
 * regardless of the project's background colour. */
function backgroundClear(hex: string): [number, number, number, number] {
  const [r, g, b] = /^#?[0-9a-f]{6}$/i.test(hex.trim()) ? hexToRgb01(hex) : [0, 0, 0];
  return [r, g, b, 1];
}

function mapEffect(e: WireEffect): EffectStep {
  switch (e.type) {
    case "preset":
      return presetEffectStep((e.id as EffectId) ?? "none");
    case "brightness":
      return brightnessEffect(e.amount ?? 1);
    case "contrast":
      return contrastEffect(e.amount ?? 1);
    case "saturation":
      return saturationEffect(e.amount ?? 1);
    case "hueRotate":
      return hueEffect(e.amount ?? 0);
    case "blur":
      return blurEffect(e.radiusPx ?? 3);
    case "vignette":
      return vignetteEffect(e.strength ?? 0.5);
    case "chromaKey":
      return chromaKeyEffect(hexToRgb01(e.color ?? "#00ff00"), e.tolerance ?? 0.4, 0.1);
    case "glow":
      return glowEffect(0.7, 8, e.strength ?? 0.6);
    default:
      return presetEffectStep("none");
  }
}

/**
 * Turns a wire layer's payload into something the compositor can upload.
 *
 * Video frames arrive as raw RGBA already scaled to their destination box,
 * so they become an `ImageData` view over the transferred buffer with **no
 * copy and no image decode** — the old path base64'd a PNG, built a data:
 * URL, and made the browser inflate and decode it once per layer per frame.
 */
/**
 * Ensures the families a text layer needs are actually loaded before it is
 * measured or drawn.
 *
 * This uses `loadFullFont` — the *same* loader the editor preview uses — so
 * the export rasterises with byte-identical font files and therefore
 * identical metrics, line breaks and baselines. Rendering before the face is
 * ready would silently fall back to a default font and change the wrapping.
 */
const requestedFamilies = new Set<string>();
async function ensureFontsLoaded(layers: WireLayer[]): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const layer of layers) {
    const family = layer.text?.style?.fontFamily;
    if (!family) continue;
    for (const part of family.split(",")) {
      const name = part.trim().replace(/^['"]|['"]$/g, "");
      // Generic CSS families have no webfont to fetch.
      if (!name || /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(name)) continue;
      if (requestedFamilies.has(name)) continue;
      requestedFamilies.add(name);
      pending.push(loadFullFont({ family: name }).catch(() => undefined));
    }
  }
  if (pending.length > 0) {
    await Promise.all(pending);
    await document.fonts.ready;
  }
}

/** Rasterises a text layer into its box using the shared renderer. */
function renderTextSource(
  layer: WireLayer,
  canvasWidth: number,
  canvasHeight: number,
): { source: TexImageSource; width: number; height: number } | null {
  const t = layer.text!;
  const boxWidth = (layer.wPct / 100) * canvasWidth;
  const boxHeight = (layer.hPct / 100) * canvasHeight;
  const style = resolveTextStyle(t.style, t.kind, canvasHeight);
  const rendered = renderTextLayer(
    { text: t.content, style, boxWidth, boxHeight, words: t.words, timeMs: t.timeMs },
    (w, h) => new OffscreenCanvas(w, h),
  );
  if (!rendered) return null;
  return { source: rendered as unknown as TexImageSource, width: rendered.width, height: rendered.height };
}

async function decodeLayerSource(
  layer: WireLayer,
  canvasWidth = 0,
  canvasHeight = 0,
): Promise<{ source: TexImageSource; width: number; height: number } | null> {
  const decoded = await decodeLayerSourceUncropped(layer, canvasWidth, canvasHeight);
  if (!decoded) return null;

  // Wipe transitions crop the SOURCE, not just the destination box. Cropping
  // here (rather than in the compositor) keeps it backend-agnostic: the WebGL2
  // and Rust/WASM compositors both just receive a narrower image. Only runs
  // while a wipe is on screen, so the normal path is untouched.
  const crop = cropFractions(layer);
  if (!crop) return decoded;
  if (crop.kept <= 0) return null; // fully wiped away — nothing to draw

  const sx = Math.round(crop.left * decoded.width);
  const sw = Math.max(1, Math.round(crop.kept * decoded.width));
  const bitmap = await createImageBitmap(decoded.source as ImageBitmapSource, sx, 0, sw, decoded.height);
  if (decoded.source instanceof ImageBitmap) decoded.source.close();
  return { source: bitmap, width: bitmap.width, height: bitmap.height };
}

async function decodeLayerSourceUncropped(
  layer: WireLayer,
  canvasWidth: number,
  canvasHeight: number,
): Promise<{ source: TexImageSource; width: number; height: number } | null> {
  if (layer.text) return renderTextSource(layer, canvasWidth, canvasHeight);
  if (layer.rgba && layer.srcWidth && layer.srcHeight) {
    const bytes = layer.rgba;
    const clamped = new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      source: new ImageData(clamped, layer.srcWidth, layer.srcHeight),
      width: layer.srcWidth,
      height: layer.srcHeight,
    };
  }
  if (layer.encoded) {
    const blob = new Blob([layer.encoded], { type: layer.mimeType ?? "image/png" });
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  }
  return null;
}

/**
 * Reads the drawing buffer back as raw RGBA bytes.
 *
 * Rows come out **bottom-first**: the framebuffer now holds a correctly
 * oriented frame (context.ts's quad maps the rect's top edge to the
 * texture's top row), and `gl.readPixels`' origin is bottom-left. The
 * encoder flips them with a `vflip` filter rather than this doing it on the
 * render loop's critical path — see encode-pipeline.ts.
 *
 * Do not "fix" the orientation here without re-checking placement as well as
 * content: an earlier version of this pipeline cancelled readPixels' row
 * order against an inverted quad, which produced correctly-oriented *pixels*
 * inside each layer while silently mirroring every layer's *position*.
 */
function readCanvasRgba(gl: WebGL2RenderingContext, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

async function renderFrameWebgl2(
  compositor: GpuCompositor,
  canvas: HTMLCanvasElement,
  sizeRef: React.MutableRefObject<{ width: number; height: number }>,
  request: FrameRequest,
): Promise<Uint8Array> {
  if (sizeRef.current.width !== request.width || sizeRef.current.height !== request.height) {
    canvas.width = request.width;
    canvas.height = request.height;
    sizeRef.current = { width: request.width, height: request.height };
  }

  await ensureFontsLoaded(request.layers);
  const decoded = await Promise.all(
    request.layers.map((l) => decodeLayerSource(l, request.width, request.height)),
  );

  const layers: ResolvedLayer[] = [];
  request.layers.forEach((l, i) => {
    const d = decoded[i];
    if (!d) return;

    // Destination box, narrowed by the same fractions the source was cropped
    // by, so a wipe reveals the layer in place instead of squashing it.
    let boxX = (l.xPct / 100) * request.width;
    let boxW = (l.wPct / 100) * request.width;
    const crop = cropFractions(l);
    if (crop) {
      if (crop.kept <= 0) return;
      boxX += crop.left * boxW;
      boxW *= crop.kept;
    }

    layers.push({
      clipId: l.clipId,
      source: d.source,
      sourceIsTexture: false,
      transform: {
        x: boxX,
        y: (l.yPct / 100) * request.height,
        w: boxW,
        h: (l.hPct / 100) * request.height,
        rotation: l.rotationDeg,
        opacity: l.opacity,
      },
      // Raw video frames were already fitted to their destination box by
      // ffmpeg's scale/crop/pad filter, so re-applying object-fit here would
      // crop them a second time.
      fit: l.rgba || l.text ? "fill" : l.fit,
      effects: l.effects.map(mapEffect),
    });
  });

  compositor.compositeFrame(
    layers,
    { width: request.width, height: request.height, framebuffer: null },
    { presentationTimestamp: 0, timelineTimestamp: 0, version: 1 },
    [],
    backgroundClear(request.background),
  );

  const rgba = readCanvasRgba(compositor.context.gl, request.width, request.height);
  for (const d of decoded) {
    if (d && d.source instanceof ImageBitmap) d.source.close();
  }
  return rgba;
}

async function renderFrameWasm(wasm: WasmCompositor, request: FrameRequest): Promise<Uint8Array> {
  await ensureFontsLoaded(request.layers);
  const decoded = await Promise.all(
    request.layers.map((l) => decodeLayerSource(l, request.width, request.height)),
  );

  const wasmLayers: WasmLayerInput[] = [];
  request.layers.forEach((l, i) => {
    const d = decoded[i];
    if (!d) return;
    const boxW = (l.wPct / 100) * request.width;
    const boxH = (l.hPct / 100) * request.height;
    const boxX = (l.xPct / 100) * request.width;
    const boxY = (l.yPct / 100) * request.height;
    // The Rust quad transform has no UV-crop concept, so object-fit is baked
    // into the uploaded texture. Raw video frames are already box-sized, so
    // they only need a straight blit.
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(boxW)), Math.max(1, Math.round(boxH)));
    const ctx = canvas.getContext("2d")!;
    drawFitted(ctx, d.source, d.width, d.height, canvas.width, canvas.height, l.rgba || l.text ? "fill" : l.fit);
    wasmLayers.push({
      clipId: l.clipId,
      source: canvas,
      centerX: boxX + boxW / 2,
      centerY: boxY + boxH / 2,
      width: boxW,
      height: boxH,
      rotationDeg: l.rotationDeg,
      opacity: l.opacity,
      effects: l.effects.map(mapEffect),
    });
  });

  const rgba = await wasm.renderFrame(request.width, request.height, wasmLayers);
  for (const d of decoded) {
    if (d && d.source instanceof ImageBitmap) d.source.close();
  }
  // The wire contract is bottom-row-first (the encoder vflips — see
  // readCanvasRgba). This path reads back through a 2D canvas, which is
  // top-row-first, so it has to be flipped to match.
  const rowBytes = request.width * 4;
  const flipped = new Uint8Array(rgba.length);
  for (let y = 0; y < request.height; y++) {
    flipped.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), (request.height - 1 - y) * rowBytes);
  }
  return flipped;
}

function drawFitted(
  ctx: OffscreenCanvasRenderingContext2D,
  source: TexImageSource,
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
  fit: "cover" | "contain" | "fill",
): void {
  const drawable = source as CanvasImageSource;
  if (fit === "fill" || !srcW || !srcH) {
    ctx.drawImage(drawable, 0, 0, boxW, boxH);
    return;
  }
  const srcAspect = srcW / srcH;
  const boxAspect = boxW / boxH;
  if (fit === "contain") {
    const w = srcAspect > boxAspect ? boxW : boxH * srcAspect;
    const h = srcAspect > boxAspect ? boxW / srcAspect : boxH;
    ctx.drawImage(drawable, (boxW - w) / 2, (boxH - h) / 2, w, h);
    return;
  }
  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;
  if (srcAspect > boxAspect) {
    sw = srcH * boxAspect;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / boxAspect;
    sy = (srcH - sh) / 2;
  }
  ctx.drawImage(drawable, sx, sy, sw, sh, 0, 0, boxW, boxH);
}

export default function ExportRenderWorkerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const bridge = (window as unknown as { __exportBridge?: ExportBridge }).__exportBridge;
    if (!canvas || !bridge) return;

    const wantsWasm = new URLSearchParams(window.location.search).get("engine") === "wasm";
    const compositor = new GpuCompositor(canvas);
    let wasm: WasmCompositor | null = null;
    let disposed = false;

    void (async () => {
      if (wantsWasm) {
        try {
          const { WasmCompositor: WasmComp } = await import("@/lib/gpu-compositor/wasm-compositor");
          await WasmComp.initializeGpu();
          if (!disposed) wasm = new WasmComp();
        } catch (err) {
          bridge.log("warn", `[export-render-worker] WASM/wgpu compositor unavailable, using WebGL2: ${String(err)}`);
        }
      }

      bridge.onFrame(async (request) => {
        if (wasm) {
          try {
            return await renderFrameWasm(wasm, request);
          } catch (err) {
            bridge.log(
              "warn",
              `[export-render-worker] WASM compositor render failed — falling back to WebGL2 for the rest of this export: ${String(err)}`,
            );
            wasm = null;
          }
        }
        return renderFrameWebgl2(compositor, canvas, sizeRef, request);
      });

      bridge.ready(wasm ? "wasm-wgpu" : "webgl2");
    })();

    return () => {
      disposed = true;
      compositor.dispose();
    };
  }, []);

  return (
    <div style={{ background: "#000" }}>
      <canvas ref={canvasRef} width={16} height={16} />
    </div>
  );
}
