/**
 * preload-editor.ts — context bridge for the native editor window.
 * Separate from the root preload.ts (splash/settings/login/main-window
 * chrome) since this window has an entirely different, editor-scoped API
 * surface and no reason to expose auth/config channels to it.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("editorAPI", {
  load: (projectId: string) => ipcRenderer.invoke("editor:load", projectId),

  save: (payload: {
    projectId: string;
    timeline: unknown;
    isAutosave: boolean;
    bumpVersion: boolean;
  }) => ipcRenderer.invoke("editor:save", payload),

  exportStart: (options: unknown): Promise<{ jobId: string }> =>
    ipcRenderer.invoke("editor:export:start", options),

  exportStatus: (jobId: string) => ipcRenderer.invoke("editor:export:status", jobId),

  exportCancel: (jobId: string): Promise<boolean> => ipcRenderer.invoke("editor:export:cancel", jobId),

  saveRecoverySnapshot: (payload: { projectId: string; timeline: unknown; timelineVersion: number }): void => {
    ipcRenderer.send("editor:recovery:snapshot", payload);
  },

  getThumbnail: (mediaAssetId: string): Promise<string | null> =>
    ipcRenderer.invoke("editor:media:thumbnail", mediaAssetId),

  onExportProgress: (callback: (jobId: string, percent: number) => void): (() => void) => {
    const listener = (_event: unknown, jobId: string, percent: number) => callback(jobId, percent);
    ipcRenderer.on("editor:export:progress", listener);
    return () => ipcRenderer.removeListener("editor:export:progress", listener);
  },

  windowControls: {
    minimize: (): void => ipcRenderer.send("editor-window:minimize"),
    toggleMaximize: (): void => ipcRenderer.send("editor-window:toggle-maximize"),
    close: (): void => ipcRenderer.send("editor-window:close"),
  },
});
