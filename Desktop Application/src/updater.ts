/**
 * updater.ts — Auto-updater module for Video Studio Desktop.
 *
 * Uses `electron-updater` to query GitHub Releases (SanthoshGRao/Landing-Page)
 * automatically on app startup and on a periodic 15-minute background timer.
 *
 * Exposes IPC methods and status events to the renderer process.
 */

import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater";
import { ipcMain, BrowserWindow } from "electron";

export type UpdateStatus = "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  releaseNotes?: string;
  percent?: number;
  error?: string;
}

let currentState: UpdateState = { status: "idle" };
let checkTimer: NodeJS.Timeout | null = null;

function broadcastState(win?: BrowserWindow | null): void {
  const target = win || BrowserWindow.getAllWindows()[0];
  if (target && !target.isDestroyed()) {
    target.webContents.send("updater:status-changed", currentState);
  }
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Configure autoUpdater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  // NOTE: do not set `forceDevUpdateConfig` here. It makes electron-updater
  // read `dev-app-update.yml` from app.getAppPath() instead of the
  // `app-update.yml` electron-builder writes into resources/, and that file
  // isn't in the `files` list — so in a packaged build every check failed
  // with ENOENT and the app could never see a new release.

  // Logging
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    currentState = { status: "checking" };
    broadcastState(mainWindow);
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    console.log(`[updater] Update available: v${info.version}`);
    currentState = {
      status: "available",
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
    };
    broadcastState(mainWindow);
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    console.log(`[updater] App is up to date (v${info.version})`);
    currentState = { status: "not-available", version: info.version };
    broadcastState(mainWindow);
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    console.log(`[updater] Download progress: ${Math.round(progress.percent)}%`);
    currentState = {
      ...currentState,
      status: "downloading",
      percent: Math.round(progress.percent),
    };
    broadcastState(mainWindow);
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    console.log(`[updater] Update downloaded: v${info.version}`);
    currentState = {
      status: "downloaded",
      version: info.version,
      percent: 100,
    };
    broadcastState(mainWindow);
  });

  autoUpdater.on("error", (err) => {
    console.warn(`[updater] Update error:`, err?.message || err);
    currentState = {
      status: "error",
      error: err?.message || "Failed to check for updates",
    };
    broadcastState(mainWindow);
  });

  // Register IPC handlers
  ipcMain.handle("updater:get-state", () => currentState);

  ipcMain.handle("updater:check", async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err: any) {
      console.warn("[updater] Manual check error:", err?.message);
    }
    return currentState;
  });

  ipcMain.handle("updater:download", async () => {
    try {
      currentState = { ...currentState, status: "downloading", percent: 0 };
      broadcastState(mainWindow);
      await autoUpdater.downloadUpdate();
    } catch (err: any) {
      currentState = { status: "error", error: err?.message || "Download failed" };
      broadcastState(mainWindow);
    }
  });

  ipcMain.handle("updater:quit-and-install", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Initial check after 5 seconds (to allow main UI window to load completely)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);

  // Periodic background check every 15 minutes (900,000 ms)
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(() => {
    console.log("[updater] Periodic background check for updates...");
    autoUpdater.checkForUpdates().catch(() => {});
  }, 15 * 60 * 1000);
}
