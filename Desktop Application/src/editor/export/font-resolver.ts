/**
 * font-resolver.ts — resolves a CSS font-family to an actual font FILE on
 * this machine, so the export renders text in the font the user chose.
 *
 * Replaces fonts.ts's `resolveFontFile()`, which took no arguments at all:
 * it returned "the first font file in the bundled folder, else Arial",
 * ignoring the requested family entirely. It was also **dead code** — no
 * caller ever invoked it, so `BuildInput.fontFilePath` was always undefined
 * and `filtergraph-builder` logged "No font file resolved — skipping text
 * clip <id>" for every text clip on every export.
 *
 * Search order (first hit wins):
 *   1. bundled application fonts   (resources/fonts)
 *   2. downloaded Google fonts     (<userData>/fonts)
 *   3. user-installed fonts        (%LOCALAPPDATA%\Microsoft\Windows\Fonts)
 *   4. system fonts                (%WINDIR%\Fonts)
 *
 * Only if the requested family genuinely does not exist anywhere does this
 * fall back — and the fallback is reported, never silent.
 */
import { app } from "electron";
import fs from "fs";
import path from "path";
import { logger } from "../diagnostics/logger";

export interface ResolvedFont {
  family: string;
  /** Absolute path to the .ttf/.otf/.ttc that will be used. */
  filePath: string;
  /** True when `family` was not found and a fallback font is being used. */
  isFallback: boolean;
  weight: number;
  italic: boolean;
}

const FONT_EXTENSIONS = [".ttf", ".otf", ".ttc"];
const FALLBACK_FAMILIES = ["Arial", "Segoe UI", "Tahoma", "Verdana"];

function fontDirectories(): string[] {
  const dirs: string[] = [];

  dirs.push(
    app.isPackaged
      ? path.join(process.resourcesPath, "fonts")
      : path.join(__dirname, "..", "..", "..", "resources", "fonts"),
  );
  dirs.push(path.join(app.getPath("userData"), "fonts"));

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    // Fonts installed "for me only" live here and are invisible to the
    // %WINDIR%\Fonts scan — a very common way for Google Fonts to be
    // installed by hand.
    if (localAppData) dirs.push(path.join(localAppData, "Microsoft", "Windows", "Fonts"));
    dirs.push(path.join(process.env.WINDIR || "C:\\Windows", "Fonts"));
  } else if (process.platform === "darwin") {
    dirs.push("/System/Library/Fonts", "/Library/Fonts", path.join(app.getPath("home"), "Library/Fonts"));
  } else {
    dirs.push("/usr/share/fonts", "/usr/local/share/fonts", path.join(app.getPath("home"), ".fonts"));
  }

  return dirs;
}

interface FontFile {
  filePath: string;
  /** Lowercased, punctuation-stripped file stem, e.g. "playfairdisplaybold". */
  normalizedStem: string;
}

let fileIndex: FontFile[] | null = null;

/** Normalises a family name or file stem to a comparable token:
 * "Playfair Display" / "PlayfairDisplay-Regular.ttf" -> "playfairdisplay". */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_\-.]/g, "");
}

/** Style suffixes that appear in font filenames and must not be mistaken for
 * part of the family name when matching. */
const STYLE_SUFFIXES = [
  "extrabolditalic", "semibolditalic", "blackitalic", "boldialic", "bolditalic",
  "lightitalic", "thinitalic", "mediumitalic", "regularitalic",
  "extrabold", "semibold", "extralight", "ultralight",
  "black", "heavy", "bold", "medium", "regular", "light", "thin", "book",
  "italic", "oblique", "vf", "variable",
];

function stripStyleSuffix(stem: string): string {
  let out = stem;
  for (;;) {
    const before = out;
    for (const suffix of STYLE_SUFFIXES) {
      if (out.length > suffix.length && out.endsWith(suffix)) {
        out = out.slice(0, -suffix.length);
        break;
      }
    }
    if (out === before) return out;
  }
}

function buildIndex(): FontFile[] {
  if (fileIndex) return fileIndex;
  const index: FontFile[] = [];

  for (const dir of fontDirectories()) {
    let entries: string[];
    try {
      if (!fs.existsSync(dir)) continue;
      entries = fs.readdirSync(dir);
    } catch {
      continue; // unreadable directory (permissions) — not fatal
    }
    for (const entry of entries) {
      if (!FONT_EXTENSIONS.includes(path.extname(entry).toLowerCase())) continue;
      index.push({
        filePath: path.join(dir, entry),
        normalizedStem: normalize(path.basename(entry, path.extname(entry))),
      });
    }
  }

  fileIndex = index;
  logger.info("export", "Font index built", { fontFiles: index.length, directories: fontDirectories().length });
  return index;
}

/** Scores how well a font file matches the requested weight/italic, so
 * "Roboto-Bold.ttf" wins over "Roboto-Thin.ttf" for weight 700. */
function styleScore(stem: string, weight: number, italic: boolean): number {
  const wantsBold = weight >= 600;
  const isItalic = /italic|oblique/.test(stem);
  const isBold = /bold|black|heavy/.test(stem) && !/semibold|extrabold/.test(stem);
  const isSemiBold = /semibold|extrabold/.test(stem);
  const isLight = /light|thin/.test(stem);
  const isRegular = /regular|book/.test(stem) || (!isBold && !isSemiBold && !isLight && !isItalic);

  let score = 0;
  if (italic === isItalic) score += 4;
  if (wantsBold && (isBold || isSemiBold)) score += 4;
  else if (!wantsBold && isRegular) score += 4;
  else if (wantsBold && isRegular) score += 1;
  return score;
}

const cache = new Map<string, ResolvedFont>();

/**
 * Resolves one family (a single name, or a CSS list — the first entry wins)
 * to a concrete font file.
 *
 * Always returns a font: if nothing matches, a fallback is chosen and
 * `isFallback` is set so the caller can report it. Text is never skipped for
 * want of a font.
 */
export function resolveFont(family: string, weight = 400, italic = false): ResolvedFont {
  const requested = (family || "").split(",")[0].trim().replace(/^['"]|['"]$/g, "") || "Arial";
  const cacheKey = `${requested.toLowerCase()}|${weight}|${italic}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const index = buildIndex();
  const target = normalize(requested);

  const candidates = index.filter((f) => stripStyleSuffix(f.normalizedStem) === target);
  // Fall back to a prefix match so "Roboto" still finds "RobotoCondensed"
  // when no exact family match exists.
  const pool = candidates.length > 0 ? candidates : index.filter((f) => f.normalizedStem.startsWith(target));

  let resolved: ResolvedFont;
  if (pool.length > 0) {
    const best = pool.reduce((a, b) =>
      styleScore(b.normalizedStem, weight, italic) > styleScore(a.normalizedStem, weight, italic) ? b : a,
    );
    resolved = { family: requested, filePath: best.filePath, isFallback: false, weight, italic };
  } else {
    let fallbackPath: string | null = null;
    for (const fallbackFamily of FALLBACK_FAMILIES) {
      const fallbackTarget = normalize(fallbackFamily);
      const hit = index.find((f) => stripStyleSuffix(f.normalizedStem) === fallbackTarget);
      if (hit) {
        fallbackPath = hit.filePath;
        break;
      }
    }
    if (!fallbackPath && index.length > 0) fallbackPath = index[0].filePath;
    if (!fallbackPath) {
      throw new Error(
        "No font files were found on this system — text cannot be rendered. " +
          "Install at least one TrueType/OpenType font, or bundle one in resources/fonts.",
      );
    }
    logger.warn("export", "Requested font not installed — falling back", {
      requested,
      weight,
      italic,
      fallbackFile: fallbackPath,
    });
    resolved = { family: requested, filePath: fallbackPath, isFallback: true, weight, italic };
  }

  logger.info("export", "Font resolved", {
    requested,
    weight,
    italic,
    file: resolved.filePath,
    fallback: resolved.isFallback,
  });
  cache.set(cacheKey, resolved);
  return resolved;
}

/** Clears the index/cache — for tests, and after a font is downloaded into
 * <userData>/fonts at runtime. */
export function resetFontIndex(): void {
  fileIndex = null;
  cache.clear();
}
