/**
 * render-preload.ts — preload for the hidden export compositor window (see
 * render-window.ts). Its only job is to give the page a **binary** channel
 * to the main process.
 *
 * This replaces the previous transport, which serialised every frame twice
 * as base64 and shipped it through `webContents.executeJavaScript()` — i.e.
 * the main process built a ~2 MB *JavaScript source string* per frame for
 * Chromium to parse, and the page returned an ~11 MB base64 string for the
 * ~8 MB frame it had just read back. Electron's IPC structured clone moves
 * ArrayBuffers without any of that.
 *
 * `contextIsolation` is deliberately off for this window (render-window.ts):
 * it loads only our own local page, never remote content, and sharing the
 * world lets the page hand back a Uint8Array directly with no bridge copy.
 */
import { ipcRenderer } from "electron";

export interface ExportFrameRequest {
  id: number;
  width: number;
  height: number;
  /** CSS hex (e.g. "#000000") the frame is cleared to before compositing. */
  background: string;
  layers: unknown[];
}

const api = {
  /** The page calls this once its compositor is usable. */
  ready(engine: string): void {
    ipcRenderer.send("export-render:ready", engine);
  },

  /** Registers the page's frame handler. Returning a Uint8Array of RGBA
   * bytes (top row first) completes the frame. */
  onFrame(handler: (request: ExportFrameRequest) => Promise<Uint8Array>): void {
    ipcRenderer.on("export-render:frame", (_event, request: ExportFrameRequest) => {
      void (async () => {
        try {
          const rgba = await handler(request);
          // Send the underlying buffer, not the view — a Uint8Array over a
          // larger pooled ArrayBuffer would otherwise be cloned in full.
          const bytes =
            rgba.byteOffset === 0 && rgba.byteLength === rgba.buffer.byteLength
              ? rgba
              : rgba.slice();
          ipcRenderer.send("export-render:frame-done", request.id, bytes);
        } catch (err) {
          ipcRenderer.send(
            "export-render:frame-error",
            request.id,
            err instanceof Error ? err.message : String(err),
          );
        }
      })();
    });
  },

  /** Forwards page-side diagnostics into the main process's JSONL log. */
  log(level: "info" | "warn", message: string): void {
    ipcRenderer.send("export-render:log", level, message);
  },
};

// This file runs in the renderer, but the desktop app's tsconfig has no DOM
// lib (it is otherwise all main-process code), so `window` is untyped here.
(globalThis as unknown as { __exportBridge: typeof api }).__exportBridge = api;
