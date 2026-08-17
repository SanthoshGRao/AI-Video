/**
 * next build's `output: "standalone"` traces only server code — it does NOT
 * copy `.next/static` (CSS/JS chunks) or `public/` into the standalone
 * output. Without this, the standalone server boots fine but every asset
 * request 404s, leaving the browser to render raw unstyled HTML.
 *
 * Runs as a postbuild step so `.next/standalone` is always self-contained,
 * regardless of who builds it (desktop packaging, or a local standalone
 * smoke test). Harmless no-op if standalone output wasn't produced.
 */

const fs = require("fs");
const path = require("path");

const root = __dirname + "/..";
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  process.exit(0);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

copyRecursive(
  path.join(root, ".next", "static"),
  path.join(standaloneDir, ".next", "static")
);
copyRecursive(path.join(root, "public"), path.join(standaloneDir, "public"));

console.log("Copied .next/static and public/ into .next/standalone/");

/**
 * Next's output-file tracer over-includes some directories it can't
 * statically analyze (dynamic `fs` paths in src/lib/storage/*), copying
 * actual runtime data — not code — into the standalone output. In this
 * project `storage/` alone (real uploaded media/exports from local dev)
 * was 4.5GB, dwarfing the ~200MB the app's real code/deps need and
 * blowing past NSIS's 2GB installer limit. None of this is ever read at
 * runtime (the desktop app points STORAGE_ROOT at Electron's userData
 * dir instead), so it's safe to strip.
 */
const junkPaths = [
  "storage",
  "scratch",
  "logs",
  ".remotion-cache",
  "workflow.zip",
  "bun.lock",
  "package-lock.json",
  "tsconfig.tsbuildinfo",
  "check-db-timeline.ts",
  "check-jobs.ts",
  "check_api.py",
  "temp.ts",
];
for (const p of junkPaths) {
  fs.rmSync(path.join(standaloneDir, p), { recursive: true, force: true });
}
console.log("Removed non-runtime junk from .next/standalone/");

/**
 * The Prisma client loads its query compiler through a dynamic
 * `import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs")`
 * (see src/generated/prisma/internal/class.ts). Next's tracer only picked
 * up `runtime/client.js`, so the standalone copy of @prisma/client ended
 * up as a stub — and because Node stops resolving at the first
 * node_modules that contains the package, that stub SHADOWED the complete
 * copy one directory up and every single query died with
 * `Cannot find module ... query_compiler_fast_bg.postgresql.mjs`.
 *
 * Replacing the traced stub with the real package is the reliable fix:
 * whatever the tracer does or doesn't follow, what ships is complete.
 */
const packagesToMirror = ["@prisma/client", "@prisma/adapter-pg"];
for (const pkg of packagesToMirror) {
  const src = path.join(root, "node_modules", ...pkg.split("/"));
  const dest = path.join(standaloneDir, "node_modules", ...pkg.split("/"));
  if (!fs.existsSync(src)) {
    console.warn(`  ! ${pkg} not found in node_modules — skipping mirror`);
    continue;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`  Mirrored complete ${pkg} into .next/standalone/`);
}
