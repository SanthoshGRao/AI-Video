/**
 * render-window.ts — drives a hidden BrowserWindow loading the Web
 * Application's `/export-render-worker` page (its own gpu-compositor
 * instance) to composite export frames.
 *
 * This is what replaces filtergraph-builder.ts's FFmpeg -filter_complex
 * compositing: FFmpeg only decodes (see decode-pipeline.ts) and encodes
 * (see encode-pipeline.ts) frames; this window's compositor owns all the
 * actual pixel work (transform/effects/composite).
 *
 * Transport: binary Electron IPC via render-preload.ts. The previous
 * implementation used `webContents.executeJavaScript()` with base64 payloads
 * in both directions, which cost four full copies and two JS-source parses
 * of every frame — see render-preload.ts's header for the details.
 *
 * Hidden-window caveats this file has to handle explicitly:
 *  - `show: false` makes the page `document.hidden`, so Chromium throttles
 *    (and can stop driving) timers, rAF and compositing for it.
 *    `backgroundThrottling: false` keeps timers running; the compositor page
 *    additionally avoids depending on presentation/rAF at all for readback.
 *  - The window must outlive every in-flight frame; renderFrame() rejects
 *    rather than hanging if it is destroyed mid-export.
 */
import { BrowserWindow, ipcMain } from "electron";
import path from "path";
import { getServerBaseUrl } from "../../server-info";
import { logger } from "../diagnostics/logger";

export interface RenderWireEffect {
  type: string;
  [key: string]: unknown;
}

/** A text clip's stored style, passed through verbatim. The compositor page
 * resolves it with the SAME shared model the editor preview uses
 * (`lib/text/text-style.ts`), so neither side re-implements defaults,
 * authoring scale, or colour handling. */
export interface RenderWireText {
  content: string;
  /** "subtitle" or "title" — selects the authoring scale (0.55 vs 0.34). */
  kind: "subtitle" | "title";
  style: Record<string, unknown>;
  /** Per-word timings for karaoke/highlight animations. */
  words?: Array<{ word: string; startMs: number; endMs: number }>;
  /** Playhead position inside this clip, in ms — picks the active word. */
  timeMs?: number;
}

export interface RenderWireLayer {
  clipId: string;
  /** Present for text layers; the page rasterises it via the shared
   * text-renderer instead of uploading a decoded image. */
  text?: RenderWireText;
  /** Raw RGBA bytes (top row first) for pre-decoded video frames — already
   * scaled to `srcWidth x srcHeight` by decode-pipeline.ts. */
  rgba?: Uint8Array;
  /** Encoded image file bytes (PNG/JPEG/WebP/...) for still-image clips,
   * decoded by the page with createImageBitmap. */
  encoded?: Uint8Array;
  /** Required with `rgba`; ignored with `encoded` (the decoder reports it). */
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
  effects: RenderWireEffect[];
  /**
   * Fraction of the layer cropped away from each edge, 0-100, used by the
   * wipe transition. The worker page must crop the SAMPLED SOURCE as well as
   * the destination box — shrinking the box alone squashes the image instead
   * of revealing it.
   */
  cropInsetPct?: { left: number; right: number };
}

export interface RenderWindowHandle {
  /** Returns raw RGBA bytes, top-row-first, width*height*4 long. */
  renderFrame(
    width: number,
    height: number,
    background: string,
    layers: RenderWireLayer[],
  ): Promise<Buffer>;
  /** Which compositor backend the page actually initialised. */
  engine(): string;
  close(): void;
}

interface PendingFrame {
  resolve: (buf: Buffer) => void;
  reject: (err: Error) => void;
}

export async function openRenderWindow(): Promise<RenderWindowHandle> {
  const win = new BrowserWindow({
    width: 640,
    height: 360,
    show: false,
    webPreferences: {
      // Our own local page only — see render-preload.ts.
      contextIsolation: false,
      nodeIntegration: false,
      // Without this Chromium throttles the hidden window's timers to ~1 Hz,
      // which is catastrophic for a loop that runs once per output frame.
      backgroundThrottling: false,
      preload: path.join(__dirname, "render-preload.js"),
    },
  });

  const webContentsId = win.webContents.id;
  const pending = new Map<number, PendingFrame>();
  let nextFrameId = 1;
  let engineName = "unknown";
  let readyResolve: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  const isOurs = (event: Electron.IpcMainEvent): boolean => event.sender.id === webContentsId;

  const onReady = (event: Electron.IpcMainEvent, engine: string): void => {
    if (!isOurs(event)) return;
    engineName = engine;
    logger.info("export", "Export compositor ready", { engine });
    readyResolve?.();
  };
  const onFrameDone = (event: Electron.IpcMainEvent, id: number, bytes: Uint8Array): void => {
    if (!isOurs(event)) return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.resolve(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  };
  const onFrameError = (event: Electron.IpcMainEvent, id: number, message: string): void => {
    if (!isOurs(event)) return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.reject(new Error(`export compositor failed to render a frame: ${message}`));
  };
  const onLog = (event: Electron.IpcMainEvent, level: "info" | "warn", message: string): void => {
    if (!isOurs(event)) return;
    if (level === "warn") logger.warn("export", message);
    else logger.info("export", message);
  };

  ipcMain.on("export-render:ready", onReady);
  ipcMain.on("export-render:frame-done", onFrameDone);
  ipcMain.on("export-render:frame-error", onFrameError);
  ipcMain.on("export-render:log", onLog);

  const cleanup = (): void => {
    ipcMain.removeListener("export-render:ready", onReady);
    ipcMain.removeListener("export-render:frame-done", onFrameDone);
    ipcMain.removeListener("export-render:frame-error", onFrameError);
    ipcMain.removeListener("export-render:log", onLog);
  };

  // A renderer crash (OOM, GPU process loss) would otherwise leave every
  // in-flight renderFrame() promise pending forever and hang the export.
  const failAllPending = (reason: string): void => {
    for (const [, entry] of pending) entry.reject(new Error(reason));
    pending.clear();
  };
  win.webContents.on("render-process-gone", (_e, details) => {
    failAllPending(`export compositor window crashed (${details.reason})`);
  });
  win.on("closed", () => {
    failAllPending("export compositor window was closed mid-export");
    cleanup();
  });

  try {
    await win.loadURL(`${getServerBaseUrl()}/export-render-worker`);
    await Promise.race([
      ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("export-render-worker page did not become ready in time")), 30_000),
      ),
    ]);
  } catch (err) {
    cleanup();
    if (!win.isDestroyed()) win.destroy();
    throw err;
  }

  return {
    renderFrame(width, height, background, layers) {
      if (win.isDestroyed()) return Promise.reject(new Error("render window was closed mid-export"));
      const id = nextFrameId++;
      return new Promise<Buffer>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        win.webContents.send("export-render:frame", { id, width, height, background, layers });
      });
    },
    engine() {
      return engineName;
    },
    close() {
      cleanup();
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
