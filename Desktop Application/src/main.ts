/**
 * main.ts — Electron main process.
 *
 * Boot sequence:
 *   1. Show splash window
 *   2. Load config → if no API keys, show settings window
 *   3. Start embedded Postgres (or use user-supplied DATABASE_URL)
 *   4. Run prisma db push to sync schema
 *   5. Spawn Next.js server as child process
 *   6. Open main BrowserWindow → http://127.0.0.1:<port>
 *   7. Close splash
 *
 * On quit: kill Next server → stop Postgres.
 */

import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import {
  loadConfig,
  saveConfig,
  hasRequiredKeys,
  hasSignedInProfile,
  hasValidRelayToken,
  getRelayBaseUrl,
  buildServerEnv,
  storagePath,
  signOut,
  type AppConfig,
} from "./config";
import {
  startEmbeddedPostgres,
  stopEmbeddedPostgres,
} from "./postgres";
import {
  startNextServer,
  stopNextServer,
  pushSchema,
  seedDatabase,
} from "./server";
import { signInWithGoogle } from "./oauth";
import { registerEditorProtocolSchemes, registerEditorProtocolHandlers } from "./editor/protocols";
import { registerEditorIpc } from "./editor/ipc";
import { openEditorWindow } from "./editor/window";
import { closePool } from "./editor/data/pool";
import { setServerBaseUrl } from "./server-info";
import { initAutoUpdater } from "./updater";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PORT = 3100;
const isDev = !app.isPackaged;

// Must run before app 'ready' — registers the editor:// and media://
// custom protocol schemes used by the native editor window.
registerEditorProtocolSchemes();

/* ------------------------------------------------------------------ */
/*  Window references                                                  */
/* ------------------------------------------------------------------ */

let splashWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let loginWindow: BrowserWindow | null = null;
let isQuitting = false;

/* ------------------------------------------------------------------ */
/*  Paths                                                              */
/* ------------------------------------------------------------------ */

function getWebAppDir(): string {
  if (isDev) {
    // In development, the Web Application lives alongside Desktop Application
    return path.resolve(__dirname, "..", "..", "Web Application");
  }
  // In production, the web app is bundled as an extra resource
  return path.join(process.resourcesPath!, "webapp");
}

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getStaticFile(name: string): string {
  // HTML files are copied to dist/ alongside compiled JS
  return path.join(__dirname, name);
}

/* ------------------------------------------------------------------ */
/*  Splash window                                                      */
/* ------------------------------------------------------------------ */

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 380,
    frame: false,
    resizable: false,
    maximizable: false,
    transparent: false,
    backgroundColor: "#111113",
    show: true,
    center: true,
    skipTaskbar: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(getStaticFile("splash.html"));
  return win;
}

function updateSplash(status: string, progress: number): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash:status", status, progress);
  }
}

function splashError(message: string): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash:error", message);
  }
}

/* ------------------------------------------------------------------ */
/*  Settings window                                                    */
/* ------------------------------------------------------------------ */

function createSettingsWindow(parent?: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    width: 580,
    height: 640,
    frame: false,
    resizable: false,
    backgroundColor: "#111113",
    center: true,
    modal: !!parent,
    parent: parent || undefined,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(getStaticFile("settings.html"));
  return win;
}

/**
 * Show settings and wait for the user to save valid keys.
 * Returns the updated config.
 */
function showSettingsAndWait(current: AppConfig): Promise<AppConfig> {
  return new Promise((resolve) => {
    settingsWindow = createSettingsWindow();

    const onSaved = () => {
      const config = loadConfig();
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.close();
      }
      settingsWindow = null;
      resolve(config);
    };

    ipcMain.once("settings:saved", onSaved);

    settingsWindow.on("closed", () => {
      ipcMain.removeListener("settings:saved", onSaved);
      settingsWindow = null;
      // If they closed without saving and there's still no way to reach
      // an AI provider (no local keys, no relay), quit.
      const config = loadConfig();
      if (!hasRequiredKeys(config) && !hasValidRelayToken(config)) {
        app.quit();
      } else {
        resolve(config);
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Login window                                                       */
/* ------------------------------------------------------------------ */

function createLoginWindow(parent?: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    width: 540,
    height: 660,
    frame: false,
    resizable: false,
    backgroundColor: "#111113",
    center: true,
    modal: !!parent,
    parent: parent || undefined,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(getStaticFile("login.html"));
  return win;
}

/**
 * Show the Google sign-in window and wait for a successful sign-in.
 * Skipped entirely by the caller if a cached profile already exists.
 */
function showLoginAndWait(): Promise<AppConfig> {
  return new Promise((resolve) => {
    loginWindow = createLoginWindow();

    const onSignedIn = () => {
      const config = loadConfig();
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      loginWindow = null;
      resolve(config);
    };

    ipcMain.once("auth:signed-in", onSignedIn);

    loginWindow.on("closed", () => {
      ipcMain.removeListener("auth:signed-in", onSignedIn);
      loginWindow = null;
      // Window closed (e.g. "Quit") without completing sign-in.
      const config = loadConfig();
      if (!hasSignedInProfile(config)) {
        app.quit();
      } else {
        resolve(config);
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Main window                                                        */
/* ------------------------------------------------------------------ */

function createMainWindow(port: number): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#0f0f12",
    title: "Video Studio",
    // Fully custom chrome — no native/overlay window buttons. The Windows
    // titleBarOverlay used to draw its own min/max/close directly on top of
    // the page in the corner, which repainted independently of the web
    // content and visibly flickered/misaligned during navigation. Renderer
    // draws its own hover-revealed controls instead (see
    // src/components/desktop/window-controls.tsx in the web app) and calls
    // back through the IPC handlers below.
    frame: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Navigate to the dashboard
  const url = `http://127.0.0.1:${port}/dashboard`;
  win.loadURL(url);

  // Open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http") && !url.includes(`127.0.0.1:${port}`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // F11 toggles fullscreen — frame:false means there's no native title bar
  // for Windows to bind this to automatically, so it has to be wired up by
  // hand via the low-level before-input-event.
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  const sendFullscreenState = () => {
    if (!win.isDestroyed()) {
      win.webContents.send("window:fullscreen-changed", win.isFullScreen());
    }
  };
  win.on("enter-full-screen", sendFullscreenState);
  win.on("leave-full-screen", sendFullscreenState);

  win.once("ready-to-show", () => {
    // Close splash once the main window is painted
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    // Maximised before the first paint, so it opens filling the work area
    // rather than appearing at 1440x920 and visibly snapping outwards. The
    // width/height above stay as the restore-down size.
    win.maximize();
    win.show();
    win.focus();
  });

  const sendMaximizedState = () => {
    if (!win.isDestroyed()) {
      win.webContents.send("window:maximized-changed", win.isMaximized());
    }
  };
  win.on("maximize", sendMaximizedState);
  win.on("unmaximize", sendMaximizedState);

  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

/* ------------------------------------------------------------------ */
/*  AI relay                                                           */
/* ------------------------------------------------------------------ */

// Mirrors the server-side TTL in Web Application/src/lib/relay/token.ts.
const RELAY_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Exchanges a fresh Google ID token for a relay token and caches it.
 * Non-fatal on failure — callers should treat this as best-effort, since
 * a user with their own API keys configured doesn't need the relay at all.
 */
async function mintRelayToken(idToken: string): Promise<void> {
  const relayUrl = getRelayBaseUrl();
  const res = await fetch(`${relayUrl}/api/relay/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    throw new Error(`Relay sign-in failed (${res.status})`);
  }
  const { relayToken } = (await res.json()) as { relayToken: string };
  saveConfig({
    relayToken,
    relayTokenExpiresAt: Date.now() + RELAY_TOKEN_TTL_MS,
  });
}

/* ------------------------------------------------------------------ */
/*  Boot sequence                                                      */
/* ------------------------------------------------------------------ */

async function boot(): Promise<void> {
  // 1. Splash
  splashWindow = createSplashWindow();
  await sleep(300); // Let the splash render

  // 2. Config
  updateSplash("Loading configuration…", 5);
  let config = loadConfig();

  // Zero-setup path: no local API keys needed. Sign in with Google (once —
  // subsequent launches reuse the cached profile) and that mints a relay
  // token, so AI calls route through the hosted relay instead. Re-prompts
  // if the relay token is missing/expired, since re-minting needs a fresh
  // Google ID token.
  //
  // "Needs the relay" is specifically about OpenAI, not about having *some*
  // AI key: script generation and photo analysis go through OpenAI (see the
  // web app's src/lib/ai/client.ts), and nothing else can stand in for it.
  // Checking `hasRequiredKeys` here instead was satisfied by the baked-in
  // Gemini key, so the relay token silently never got minted and every
  // OpenAI-backed feature failed with an auth error.
  const needsRelay = !config.openaiApiKey?.trim();
  if (!hasSignedInProfile(config) || (needsRelay && !hasValidRelayToken(config))) {
    updateSplash("Waiting for sign-in…", 10);
    config = await showLoginAndWait();
  }

  // Safety net: still nothing to reach an AI provider with (relay
  // unreachable/misconfigured and no local keys) — fall back to manual
  // key entry instead of leaving the user stuck.
  if (!hasRequiredKeys(config) && !hasValidRelayToken(config)) {
    updateSplash("AI relay unavailable — enter API keys manually…", 15);
    config = await showSettingsAndWait(config);
  }

  const port = config.port || DEFAULT_PORT;

  // 3. Ensure storage directory exists
  updateSplash("Preparing local storage…", 12);
  const storageDir = storagePath();
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  // 4. Database
  let databaseUrl: string;

  if (config.databaseUrl?.trim()) {
    // User supplied their own Postgres
    updateSplash("Connecting to database…", 20);
    databaseUrl = config.databaseUrl.trim();
  } else {
    // Start embedded Postgres
    updateSplash("Starting local database…", 15);
    try {
      databaseUrl = await startEmbeddedPostgres();
      updateSplash("Database ready", 30);
    } catch (err: any) {
      const msg =
        err?.message || "Failed to start embedded database";
      console.error("[boot]", msg);
      splashError(
        `${msg}\n\nYou can provide your own DATABASE_URL in Settings instead.`
      );
      return; // Don't proceed — splash shows the error
    }
  }

  // 5. Schema sync
  updateSplash("Syncing database schema…", 40);
  const webAppDir = getWebAppDir();
  const serverEnv = buildServerEnv(config, databaseUrl, port);

  let schemaPushOk = true;
  try {
    await pushSchema(webAppDir, serverEnv);
  } catch (err: any) {
    schemaPushOk = false;
    const msg = err?.message || "Unknown error";
    console.warn("[boot] Schema push failed:", msg);
    // Surface the warning on the splash — a failed schema push is a common
    // root cause of "Request failed" errors that are otherwise invisible in
    // packaged builds (there's no terminal to see console.warn output).
    updateSplash(`⚠ Schema sync issue: ${msg.slice(0, 80)}`, 45);
    // Non-fatal — schema may already be up to date from a previous launch
  }

  // Seed property templates + prompt chips on every launch. The seed is
  // pure `INSERT ... ON CONFLICT DO NOTHING` now, so re-running it is a
  // cheap no-op once the rows exist — and it self-heals a database left
  // half-populated by an earlier build. (It used to be gated behind a
  // `.seeded` marker file, which meant one failed seed was permanent.)
  // If schema push failed, skip it entirely — it would only fail too.
  if (!schemaPushOk) {
    console.warn("[boot] Skipping seed — schema push failed earlier");
    updateSplash("⚠ Skipped template loading (schema issue)", 47);
  } else {
    updateSplash("Loading project templates…", 47);
    try {
      await seedDatabase(webAppDir, serverEnv);
    } catch (err: any) {
      const msg = err?.message || "Unknown error";
      console.warn("[boot] Seeding templates failed:", msg);
      updateSplash(`⚠ Template loading issue: ${msg.slice(0, 80)}`, 48);
      // Non-fatal — user can still use the app, just without templates.
    }
  }

  // 6. Start Next.js
  updateSplash("Starting application server…", 50);
  try {
    await startNextServer({
      webAppDir,
      port,
      env: serverEnv,
      onLog: (line) => {
        // Surface meaningful lines in the splash
        if (line.includes("Ready") || line.includes("started")) {
          updateSplash("Server ready", 90);
        }
      },
    });
  } catch (err: any) {
    const msg = err?.message || "Failed to start the application server";
    console.error("[boot]", msg);
    splashError(msg);
    return;
  }

  // 7. Main window
  updateSplash("Opening Video Studio…", 95);
  setServerBaseUrl(`http://127.0.0.1:${port}`);
  mainWindow = createMainWindow(port);
  initAutoUpdater(mainWindow);
}

/* ------------------------------------------------------------------ */
/*  IPC handlers                                                       */
/* ------------------------------------------------------------------ */

function registerIpc(): void {
  ipcMain.handle("config:get", () => loadConfig());

  ipcMain.handle("config:save", (_event, config: AppConfig) => {
    saveConfig(config);
    ipcMain.emit("settings:saved");
  });

  ipcMain.on("settings:close", () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });

  ipcMain.handle("auth:signInWithGoogle", async () => {
    const config = loadConfig();
    const profile = await signInWithGoogle(config.googleClientId!, config.googleClientSecret!);
    try {
      await mintRelayToken(profile.idToken);
    } catch (err) {
      console.warn("[auth] Relay token exchange failed (non-fatal):", err);
    }
    return profile;
  });

  ipcMain.on("auth:sign-out", async () => {
    signOut();
    // app.exit() skips 'before-quit', so shut the children down explicitly —
    // otherwise the orphaned Next server + embedded Postgres (data-dir lock)
    // make the relaunched instance fail to boot.
    isQuitting = true;
    console.log("[main] Signing out — shutting down children before relaunch…");
    mainWindow?.hide();
    stopNextServer();
    // Cap the Postgres shutdown so a hung stop can never strand sign-out.
    await Promise.race([stopEmbeddedPostgres(), sleep(10_000)]);
    app.relaunch();
    app.exit(0);
  });

  ipcMain.on("app:quit", () => {
    app.quit();
  });

  ipcMain.on("window:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window:toggle-maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });

  ipcMain.on("window:close", () => {
    mainWindow?.close();
  });

  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);

  /* ---- Native editor window ---- */

  ipcMain.handle("editor:open", (_event, projectId: string) => {
    openEditorWindow(projectId);
  });

  ipcMain.on("editor-window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on("editor-window:toggle-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("editor-window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}

/* ------------------------------------------------------------------ */
/*  App lifecycle                                                      */
/* ------------------------------------------------------------------ */

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on("ready", async () => {
  registerIpc();
  registerEditorIpc();
  registerEditorProtocolHandlers(
    isDev
      ? path.join(__dirname, "..", "editor-renderer", "dist")
      : path.join(process.resourcesPath!, "editor-renderer")
  );
  try {
    await boot();
  } catch (err) {
    console.error("[main] Fatal boot error:", err);
    app.quit();
  }
});

app.on("before-quit", async () => {
  if (isQuitting) return;
  isQuitting = true;

  console.log("[main] Shutting down…");
  stopNextServer();
  await closePool();
  await stopEmbeddedPostgres();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  // macOS dock click — not really used on Windows but harmless
  if (mainWindow === null && !isQuitting) {
    boot().catch(console.error);
  }
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
