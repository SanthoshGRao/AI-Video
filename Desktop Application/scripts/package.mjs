/**
 * package.mjs — Full build + package pipeline.
 *
 * 1. Build the Web Application (npm run build)
 * 2. Build the native editor renderer (Vite)
 * 3. Compile the Desktop Application TypeScript
 * 4. Run electron-builder to produce the installer
 * 5. Rewrite release/latest.yml from the installer actually on disk
 *
 * Usage: node scripts/package.mjs
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const webAppDir = path.resolve(desktopDir, "..", "Web Application");
const editorRendererDir = path.join(desktopDir, "editor-renderer");

/**
 * Directories that must come first on PATH for `npm`/`npx` to resolve.
 *
 * All derived from this process rather than hardcoded: an earlier version
 * of this script pinned absolute `D:\Santhosh\Desktop\AI Video\...` paths,
 * which meant the build only worked on one machine in one folder.
 *
 * `path.dirname(process.execPath)` is the Node install directory, and it
 * genuinely has to be prepended: if `<node>/node_modules/npm/bin` happens
 * to sit ahead of `<node>` on the inherited PATH — as it does on this
 * machine — `npm` resolves to the *inner* shim and dies with
 * "Cannot find module .../node_modules/npm/bin/node_modules/npm/bin/npm-cli.js".
 */
const binPaths = [
  path.dirname(process.execPath),
  path.join(webAppDir, "node_modules", ".bin"),
  path.join(desktopDir, "node_modules", ".bin"),
];

function run(cmd, cwd, env) {
  console.log(`\n▸ ${cmd}`);
  console.log(`  cwd: ${cwd}\n`);
  const currentPath = process.env.Path || process.env.PATH || "";
  const mergedPath = [...binPaths, currentPath].join(path.delimiter);
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, Path: mergedPath, PATH: mergedPath, ...env },
  });
}

function step(n, title) {
  console.log("\n═══════════════════════════════════════");
  console.log(`  Step ${n}: ${title}`);
  console.log("═══════════════════════════════════════");
}

try {
  // Step 1: Build the Web Application
  //
  // NEXT_PUBLIC_DESKTOP_MODE must be set at BUILD time, not just when the
  // server is later spawned: Next.js inlines NEXT_PUBLIC_* vars into the
  // client bundle at `next build` time, so setting it only as a runtime env
  // var (as config.ts does for the spawned server process) has no effect on
  // client code — ClerkProvider/UserButton/useUser would still compile in.
  step(1, "Build Web Application (desktop mode)");
  run("npm run build", webAppDir, { NEXT_PUBLIC_DESKTOP_MODE: "true" });

  // Step 2: Build the native editor window's renderer.
  //
  // electron-builder copies `editor-renderer/dist` into the installer
  // verbatim (see extraResources), so leaving this out of the pipeline
  // silently shipped whatever stale bundle happened to be lying around.
  step(2, "Build Editor Renderer");
  run("npm run build", editorRendererDir);

  // Step 3: Compile Desktop Application
  step(3, "Compile Desktop Application");
  run("npm run build", desktopDir);

  // Step 4: Package with electron-builder
  step(4, "Package Installer");
  run("npx electron-builder --config electron-builder.config.js", desktopDir);

  // Step 5: Verify and align latest.yml sha512 checksum
  step(5, "Verify latest.yml Checksum");
  run("node scripts/fix-latest-yml.js", desktopDir);

  const version = JSON.parse(
    fs.readFileSync(path.join(desktopDir, "package.json"), "utf8")
  ).version;
  console.log(
    `\n✔ Build complete. release/Video-Studio-Setup-${version}.exe\n`
  );
} catch (err) {
  console.error("\n✖ Build failed:", err.message);
  process.exit(1);
}
