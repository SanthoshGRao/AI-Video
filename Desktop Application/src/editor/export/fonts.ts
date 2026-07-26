/**
 * fonts.ts — resolves a font file for ffmpeg's `drawtext` filter, which
 * (unlike a browser) needs an explicit .ttf/.otf path rather than a family
 * name on most Windows ffmpeg builds (no fontconfig).
 */

import { app } from "electron";
import fs from "fs";
import path from "path";

const WINDOWS_FALLBACKS = [
  "C:\\Windows\\Fonts\\arial.ttf",
  "C:\\Windows\\Fonts\\segoeui.ttf",
];

function bundledFontsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "fonts")
    : path.join(__dirname, "..", "..", "..", "resources", "fonts");
}

let cached: string | undefined;
let resolved = false;

export function resolveFontFile(): string | undefined {
  if (resolved) return cached;
  resolved = true;

  const bundledDir = bundledFontsDir();
  if (fs.existsSync(bundledDir)) {
    const candidate = fs
      .readdirSync(bundledDir)
      .find((f) => f.toLowerCase().endsWith(".ttf") || f.toLowerCase().endsWith(".otf"));
    if (candidate) {
      cached = path.join(bundledDir, candidate);
      return cached;
    }
  }

  for (const fallback of WINDOWS_FALLBACKS) {
    if (fs.existsSync(fallback)) {
      cached = fallback;
      return cached;
    }
  }

  console.warn("[fonts] No font file found — drawtext-based clips will be skipped in export.");
  return undefined;
}
