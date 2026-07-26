/**
 * dev.js — runs the editor-renderer Vite dev server and the Electron app
 * together for `npm run dev`, so the native editor window (which loads
 * http://localhost:5173 in dev — see src/editor/window.ts) always has a
 * server to connect to instead of requiring a second terminal.
 *
 * It also builds the Web Application first when that build is stale (see
 * scripts/build-web.js), so `npm run dev` here is the only command needed.
 * Pass --skip-web to leave the existing web build alone, or --force-web to
 * rebuild it unconditionally.
 */

const { spawn, execSync } = require("child_process");
const path = require("path");
const buildWeb = require("./build-web");

const rootDir = path.join(__dirname, "..");
const editorRendererDir = path.join(rootDir, "editor-renderer");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

const children = [];

// child.kill() with shell:true only kills the cmd.exe wrapper on Windows,
// not the real npm/electron process it spawned underneath — same gotcha
// documented in src/server.ts's stopNextServer(). taskkill /t kills the
// whole tree.
function killTree(child) {
  if (!child.pid || child.killed) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: "ignore" });
    } catch {
      /* already exited */
    }
  } else {
    child.kill();
  }
}

let cleaningUp = false;
function cleanupAndExit(code) {
  if (cleaningUp) return;
  cleaningUp = true;
  for (const child of children) killTree(child);
  process.exit(code ?? 0);
}

process.on("SIGINT", () => cleanupAndExit(0));
process.on("SIGTERM", () => cleanupAndExit(0));

// Done before anything is spawned, so a failing web build doesn't leave
// orphaned Vite/Electron processes behind.
const args = process.argv.slice(2);
buildWeb.run([
  ...(args.includes("--skip-web") ? ["--skip"] : []),
  ...(args.includes("--force-web") ? ["--force"] : []),
]);

console.log("[dev] Starting editor-renderer Vite dev server...");
const vite = spawn(npmCmd, ["run", "dev"], {
  cwd: editorRendererDir,
  stdio: "inherit",
  shell: true,
});
children.push(vite);
vite.on("exit", (code) => {
  console.log(`[dev] editor-renderer dev server exited (${code}) — stopping Electron too.`);
  cleanupAndExit(code ?? 0);
});

console.log("[dev] Building Desktop Application...");
execSync("npm run build", { cwd: rootDir, stdio: "inherit" });

console.log("[dev] Starting Electron...");
const electron = spawn(npxCmd, ["electron", "."], {
  cwd: rootDir,
  stdio: "inherit",
  shell: true,
});
children.push(electron);
electron.on("exit", (code) => {
  console.log(`[dev] Electron exited (${code}).`);
  cleanupAndExit(code ?? 0);
});
