/**
 * package.mjs — Full build + package pipeline.
 *
 * 1. Build the Web Application (npm run build)
 * 2. Compile the Desktop Application TypeScript
 * 3. Run electron-builder to produce the installer
 *
 * Usage: node scripts/package.mjs
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const webAppDir = path.resolve(desktopDir, "..", "Web Application");

function run(cmd, cwd, env) {
  console.log(`\n▸ ${cmd}`);
  console.log(`  cwd: ${cwd}\n`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

try {
  // Step 1: Build the Web Application
  //
  // NEXT_PUBLIC_DESKTOP_MODE must be set at BUILD time, not just when the
  // server is later spawned: Next.js inlines NEXT_PUBLIC_* vars into the
  // client bundle at `next build` time, so setting it only as a runtime env
  // var (as config.ts does for the spawned server process) has no effect on
  // client code — ClerkProvider/UserButton/useUser would still compile in.
  console.log("═══════════════════════════════════════");
  console.log("  Step 1: Build Web Application (desktop mode)");
  console.log("═══════════════════════════════════════");
  run("npm run build", webAppDir, { NEXT_PUBLIC_DESKTOP_MODE: "true" });

  // Step 2: Compile Desktop Application
  console.log("\n═══════════════════════════════════════");
  console.log("  Step 2: Compile Desktop Application");
  console.log("═══════════════════════════════════════");
  run("npm run build", desktopDir);

  // Step 3: Package with electron-builder
  console.log("\n═══════════════════════════════════════");
  console.log("  Step 3: Package Installer");
  console.log("═══════════════════════════════════════");
  run("npx electron-builder --config electron-builder.config.js", desktopDir);

  console.log("\n✔ Build complete. Installer is in release/\n");
} catch (err) {
  console.error("\n✖ Build failed:", err.message);
  process.exit(1);
}
