/**
 * window.ts — the dedicated native editor BrowserWindow. Separate from
 * the main dashboard window (which stays bound to the Next.js server) so
 * both can be open independently and the editor's webPreferences/protocol
 * setup stays isolated from the rest of the app.
 */

import { app, BrowserWindow } from "electron";
import path from "path";

const openWindows = new Map<string, BrowserWindow>();

function getPreloadPath(): string {
  // window.ts itself compiles to dist/editor/window.js, so __dirname here
  // is already dist/editor — preload-editor.js is a sibling file, not
  // nested under another "editor" segment.
  return path.join(__dirname, "preload-editor.js");
}

function editorDevServerUrl(): string {
  return process.env.EDITOR_DEV_SERVER_URL || "http://localhost:5173";
}

export function openEditorWindow(projectId: string): void {
  const existing = openWindows.get(projectId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#0b0b0d",
    title: "Video Studio — Editor",
    frame: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (!app.isPackaged) {
    win.loadURL(`${editorDevServerUrl()}?projectId=${encodeURIComponent(projectId)}`);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadURL(`editor://app/index.html?projectId=${encodeURIComponent(projectId)}`);
  }

  win.on("closed", () => {
    openWindows.delete(projectId);
  });

  openWindows.set(projectId, win);
}
