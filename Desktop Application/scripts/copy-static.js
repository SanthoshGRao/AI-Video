/**
 * copy-static.js — Copy HTML files from src/ to dist/ after TypeScript compilation.
 * Run via `npm run copy-static`.
 *
 * Also bakes `secrets.json` into dist/ when it's present. That file holds the
 * shared Google AI key the zero-setup path uses, and it is deliberately
 * gitignored: this repository is public, and a Gemini key committed here
 * would be scraped and revoked within hours — taking every install down with
 * it. See secrets.example.json.
 */

const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "src");
const distDir = path.join(__dirname, "..", "dist");

// Ensure dist/ exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy all .html and image files
const staticFiles = fs.readdirSync(srcDir).filter((f) => 
  f.endsWith(".html") || f.endsWith(".png") || f.endsWith(".svg") || f.endsWith(".jpg") || f.endsWith(".webp")
);

for (const file of staticFiles) {
  const src = path.join(srcDir, file);
  const dest = path.join(distDir, file);
  fs.copyFileSync(src, dest);
  console.log(`  Copied ${file} → dist/${file}`);
}

console.log(`  ${staticFiles.length} static file(s) copied.`);

// Baked secrets (optional — absent in a fresh clone, and that's fine: the
// app falls back to Settings / the AI relay for keys).
const secretsSrc = path.join(__dirname, "..", "secrets.json");
if (fs.existsSync(secretsSrc)) {
  fs.copyFileSync(secretsSrc, path.join(distDir, "secrets.json"));
  console.log("  Copied secrets.json → dist/secrets.json");
} else {
  console.log("  No secrets.json — building without a baked-in AI key.");
}
