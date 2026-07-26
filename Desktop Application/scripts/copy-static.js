/**
 * copy-static.js — Copy HTML files from src/ to dist/ after TypeScript compilation.
 * Run via `npm run copy-static`.
 */

const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "src");
const distDir = path.join(__dirname, "..", "dist");

// Ensure dist/ exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy all .html files
const htmlFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith(".html"));

for (const file of htmlFiles) {
  const src = path.join(srcDir, file);
  const dest = path.join(distDir, file);
  fs.copyFileSync(src, dest);
  console.log(`  Copied ${file} → dist/${file}`);
}

console.log(`  ${htmlFiles.length} static file(s) copied.`);
