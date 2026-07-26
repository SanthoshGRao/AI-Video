/**
 * build-web.js — builds the Web Application's Next.js bundle, but only when
 * it's actually stale.
 *
 * The desktop shell serves the web app from `Web Application/.next/standalone`
 * (see src/server.ts), so a fresh checkout — or any edit under the web app's
 * src/ — needs `npm run build` there before `npm run dev` here. Doing that by
 * hand every time is slow and easy to forget, so dev.js calls this instead:
 * it fingerprints the web app's sources against the last build and rebuilds
 * only if something changed.
 *
 * Usage (also runnable standalone):
 *   node scripts/build-web.js           # build if stale
 *   node scripts/build-web.js --force   # always build
 *   node scripts/build-web.js --skip    # never build (just report)
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const webAppDir = path.resolve(__dirname, "..", "..", "Web Application");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

/** Inputs whose mtime should invalidate the build. */
const WATCHED = [
  "src",
  "prisma",
  "public",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  // NEXT_PUBLIC_* values are inlined at build time — see the desktop-app notes.
  ".env.local",
  ".env",
];

const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", ".turbo"]);

function newestMtime(target) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;

  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const child = newestMtime(path.join(target, entry.name));
    if (child > newest) newest = child;
  }
  return newest;
}

/** mtime of the last completed build, or 0 if there isn't one. */
function lastBuildTime() {
  const standaloneEntry = path.join(webAppDir, ".next", "standalone", "server.js");
  const buildId = path.join(webAppDir, ".next", "BUILD_ID");
  if (!fs.existsSync(standaloneEntry) || !fs.existsSync(buildId)) return 0;
  return fs.statSync(buildId).mtimeMs;
}

function isStale() {
  const built = lastBuildTime();
  if (built === 0) return "no previous build found";

  for (const name of WATCHED) {
    const target = path.join(webAppDir, name);
    if (newestMtime(target) > built) return `${name} changed since last build`;
  }
  return null;
}

function buildWebApp() {
  console.log("[dev] Building Web Application (next build)...");
  execSync(`${npmCmd} run build`, { cwd: webAppDir, stdio: "inherit" });
}

function run(argv = process.argv.slice(2)) {
  if (!fs.existsSync(webAppDir)) {
    console.warn(`[dev] Web Application not found at ${webAppDir} — skipping web build.`);
    return;
  }
  if (argv.includes("--skip")) {
    console.log("[dev] Skipping Web Application build (--skip).");
    return;
  }
  if (argv.includes("--force")) {
    buildWebApp();
    return;
  }

  const reason = isStale();
  if (reason) {
    console.log(`[dev] Web Application build is stale (${reason}).`);
    buildWebApp();
  } else {
    console.log("[dev] Web Application build is up to date — skipping (use --force to rebuild).");
  }
}

if (require.main === module) run();

module.exports = { run, buildWebApp, isStale };
