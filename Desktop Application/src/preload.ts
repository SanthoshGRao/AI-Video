/**
 * preload.ts — Context bridge between Electron main ↔ renderer.
 *
 * Exposes a minimal `desktopAPI` object on window. Used by the splash
 * screen (status updates) and settings page (config read/write).
 * The main app window (Next.js) doesn't need any preload API — it
 * just runs as a normal web page.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopAPI", {
  /* ---- Splash screen ---- */

  /** Listen for boot status updates from main process. */
  onStatus: (
    callback: (status: string, progress: number) => void
  ): void => {
    ipcRenderer.on("splash:status", (_event, status: string, progress: number) => {
      callback(status, progress);
    });
  },

  /** Listen for fatal errors during boot. */
  onError: (callback: (message: string) => void): void => {
    ipcRenderer.on("splash:error", (_event, message: string) => {
      callback(message);
    });
  },

  /* ---- Settings page ---- */

  /** Get the current config. */
  getConfig: (): Promise<any> => ipcRenderer.invoke("config:get"),

  /** Save updated config and close the settings window. */
  saveConfig: (config: any): Promise<void> =>
    ipcRenderer.invoke("config:save", config),

  /** Close the settings window without saving. */
  closeSettings: (): void => ipcRenderer.send("settings:close"),

  /* ---- Sign-in page ---- */

  /**
   * Run the Google browser-redirect sign-in flow; resolves with the
   * profile or throws. The main process also exchanges the ID token for
   * an AI relay token behind the scenes before this resolves — the
   * renderer never sees the raw ID token.
   */
  signInWithGoogle: (): Promise<{ sub: string; email: string; name: string | null; picture: string | null }> =>
    ipcRenderer.invoke("auth:signInWithGoogle"),

  /** Notify the main process that sign-in is complete (profile already saved via saveConfig). */
  completeSignIn: (): void => ipcRenderer.send("auth:signed-in"),

  /* ---- Main window ---- */

  /** Clear the cached Google identity and relaunch to the sign-in screen. */
  signOut: (): void => ipcRenderer.send("auth:sign-out"),

  /**
   * Renders an export using the desktop app's hardware-accelerated ffmpeg
   * engine instead of Remotion — the old editor-v2 UI/save path is
   * otherwise unchanged. Returns the same { job: { id } } shape the old
   * POST /api/projects/[id]/export route did, so the existing polling
   * code in export-dialog.tsx works unmodified.
   */
  exportNative: (payload: {
    projectId: string;
    timeline: unknown;
    format: "mp4" | "mov" | "webm";
    resolution: string;
    aspectRatio: string;
    subtitleBurnIn: boolean;
    fps?: number;
  }): Promise<{ job: { id: string } }> => ipcRenderer.invoke("editor:export:legacy", payload),

  /**
   * Stops an in-flight native export (the dialog's "Stop export" button).
   * Resolves false when the job already finished and there was nothing to
   * kill, so the caller can fall back to the web cancel route.
   */
  cancelExportNative: (jobId: string): Promise<boolean> =>
    ipcRenderer.invoke("editor:export:cancel", jobId),

  /* ---- General ---- */

  /** Quit the application. */
  quit: (): void => ipcRenderer.send("app:quit"),

  /* ---- Main window custom title bar ---- */

  windowControls: {
    minimize: (): void => ipcRenderer.send("window:minimize"),
    toggleMaximize: (): void => ipcRenderer.send("window:toggle-maximize"),
    close: (): void => ipcRenderer.send("window:close"),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:is-maximized"),
    /** Subscribe to maximize/restore state changes; returns an unsubscribe function. */
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: unknown, maximized: boolean) => callback(maximized);
      ipcRenderer.on("window:maximized-changed", listener);
      return () => ipcRenderer.removeListener("window:maximized-changed", listener);
    },
    /** Subscribe to fullscreen (F11) state changes; returns an unsubscribe function. */
    onFullscreenChange: (callback: (fullscreen: boolean) => void): (() => void) => {
      const listener = (_event: unknown, fullscreen: boolean) => callback(fullscreen);
      ipcRenderer.on("window:fullscreen-changed", listener);
      return () => ipcRenderer.removeListener("window:fullscreen-changed", listener);
    },
  },

  /* ---- Auto-updater ---- */
  updater: {
    getState: (): Promise<any> => ipcRenderer.invoke("updater:get-state"),
    check: (): Promise<any> => ipcRenderer.invoke("updater:check"),
    download: (): Promise<void> => ipcRenderer.invoke("updater:download"),
    quitAndInstall: (): void => { ipcRenderer.invoke("updater:quit-and-install"); },
    onStatusChange: (callback: (state: any) => void): (() => void) => {
      const listener = (_event: unknown, state: any) => callback(state);
      ipcRenderer.on("updater:status-changed", listener);
      return () => ipcRenderer.removeListener("updater:status-changed", listener);
    },
  },
});
