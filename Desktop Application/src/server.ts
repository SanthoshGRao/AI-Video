/**
 * server.ts — Next.js server child-process manager.
 *
 * Spawns the web application's Next.js server and health-polls it
 * until it's ready to accept connections.
 *
 * Two modes:
 *   1. Standalone — `node .next/standalone/server.js` (if the web app
 *      was built with `output: "standalone"` in next.config.ts).
 *   2. Full — `node node_modules/next/dist/bin/next start` using the
 *      installed next binary.  Works without any web-app changes.
 *
 * Standalone is preferred for production packaging (smaller bundle),
 * but Full mode works out of the box for development.
 */

import { spawn, execSync, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";

let serverProcess: ChildProcess | null = null;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface ServerOpts {
  /** Absolute path to the Web Application directory. */
  webAppDir: string;
  /** Port to start the server on. */
  port: number;
  /** Environment variables to inject. */
  env: Record<string, string>;
  /** Optional callback for stdout/stderr lines. */
  onLog?: (line: string) => void;
}

function resolvePrismaBin(webAppDir: string): string | null {
  const prismaBin = path.join(
    webAppDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
  );
  return fs.existsSync(prismaBin) ? prismaBin : null;
}

/**
 * `prisma db seed` shells out to run the configured seed script (`tsx
 * prisma/seed.ts`), expecting `node_modules/.bin` on PATH the way it would
 * be inside an `npm run` script. Since we invoke prisma directly rather
 * than through npm, we need to add that directory to PATH ourselves.
 */
function envWithLocalBin(
  webAppDir: string,
  env: Record<string, string>
): NodeJS.ProcessEnv {
  const localBin = path.join(webAppDir, "node_modules", ".bin");
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env };
  merged.PATH = [localBin, merged.PATH].filter(Boolean).join(path.delimiter);
  return merged;
}

/**
 * Run `prisma db push` to sync the schema with the database.
 * Uses the prisma binary inside the web app's node_modules.
 */
export async function pushSchema(
  webAppDir: string,
  env: Record<string, string>
): Promise<void> {
  const prismaBin = resolvePrismaBin(webAppDir);
  if (!prismaBin) {
    console.warn(
      "[server] prisma binary not found — skipping schema push. " +
        "Make sure `npm install` was run in the Web Application directory."
    );
    return;
  }

  execSync(`"${prismaBin}" db push --accept-data-loss`, {
    cwd: webAppDir,
    env: envWithLocalBin(webAppDir, env),
    stdio: "pipe",
    timeout: 60_000,
  });
}

/**
 * Run `prisma db seed` to populate property templates + prompt chips.
 * Only needs to happen once per database — callers should skip this on
 * subsequent launches (e.g. via a marker file), since the seed script
 * unconditionally wipes and recreates prompt chips on every run.
 *
 * Invokes the prisma binary directly (same as pushSchema) rather than
 * `npm run db:seed` — going through npm's own cmd shim on Windows can
 * resolve npm-cli.js relative to the wrong directory depending on PATH.
 */
export async function seedDatabase(
  webAppDir: string,
  env: Record<string, string>
): Promise<void> {
  const prismaBin = resolvePrismaBin(webAppDir);
  if (!prismaBin) {
    console.warn("[server] prisma binary not found — skipping seed.");
    return;
  }

  execSync(`"${prismaBin}" db seed`, {
    cwd: webAppDir,
    env: envWithLocalBin(webAppDir, env),
    stdio: "pipe",
    timeout: 60_000,
  });
}

/**
 * Start the Next.js server as a child process.
 * Resolves once the server responds to a health-check request.
 */
export async function startNextServer(opts: ServerOpts): Promise<void> {
  const { webAppDir, port, env, onLog } = opts;

  // Decide which mode to use.
  const standaloneEntry = path.join(
    webAppDir,
    ".next",
    "standalone",
    "server.js"
  );
  const nextBin = path.join(
    webAppDir,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );

  let cmd: string;
  let args: string[];

  if (fs.existsSync(standaloneEntry)) {
    // Standalone mode
    cmd = process.execPath; // node
    args = [standaloneEntry];
  } else if (fs.existsSync(nextBin)) {
    // Full mode — run next start
    cmd = process.execPath;
    args = [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"];
  } else {
    throw new Error(
      `Cannot find Next.js in ${webAppDir}. ` +
        "Run `npm install && npm run build` in the Web Application directory first."
    );
  }

  const mergedEnv: Record<string, string> = {
    ...filterEnv(process.env),
    ...env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    // `cmd` here is process.execPath — Electron's own binary, used as a
    // stand-in for a plain `node` executable. In dev, the generic Electron
    // binary happily runs an arbitrary script path as a plain Node process.
    // But the PACKAGED binary has this app's own main.js baked in as its
    // default entry, so without this flag it ignores the script path and
    // relaunches a second full copy of the desktop app instead of running
    // the Next.js server.
    ELECTRON_RUN_AS_NODE: "1",
  };

  serverProcess = spawn(cmd, args, {
    cwd: webAppDir,
    env: mergedEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  // Pipe logs through callback
  const relay = (stream: NodeJS.ReadableStream | null) => {
    stream?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString("utf-8").split("\n").filter(Boolean);
      lines.forEach((line) => {
        onLog?.(line);
        console.log("[next]", line);
      });
    });
  };
  relay(serverProcess.stdout);
  relay(serverProcess.stderr);

  serverProcess.on("exit", (code) => {
    console.log(`[next] Server exited with code ${code}`);
    serverProcess = null;
  });

  // Wait for the server to become ready
  await waitForServer(port, 45_000);
}

/**
 * Kill the Next.js server child process.
 */
export function stopNextServer(): void {
  if (!serverProcess) return;
  try {
    if (process.platform === "win32") {
      // On Windows, child processes spawned with windowsHide may need
      // explicit tree-kill.  Kill the process group if possible.
      execSync(`taskkill /pid ${serverProcess.pid} /t /f`, { stdio: "ignore" });
    } else {
      serverProcess.kill("SIGTERM");
    }
  } catch {
    // Best-effort
  }
  serverProcess = null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Poll the server until it responds (or timeout). */
async function waitForServer(
  port: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ok = await probe(port);
    if (ok) return;
    await sleep(600);
  }

  throw new Error(
    `Next.js server did not respond within ${Math.round(timeoutMs / 1000)}s on port ${port}`
  );
}

function probe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: "/", timeout: 2000 },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip undefined values from process.env so Record<string,string> is clean. */
function filterEnv(
  env: NodeJS.ProcessEnv
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
