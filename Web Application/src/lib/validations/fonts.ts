import { z } from "zod";

const FONT_EXTENSIONS = [".woff2", ".woff", ".ttf", ".otf"];

export const importFontSchema = z.object({
  url: z.string().url().max(2000),
  family: z.string().trim().min(1).max(100).optional(),
});

export const recordFontUsageSchema = z.object({
  family: z.string().trim().min(1).max(100),
});

export function hasFontExtension(url: string): boolean {
  const path = url.split("?")[0].split("#")[0].toLowerCase();
  return FONT_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export function deriveFamilyNameFromUrl(url: string): string {
  const path = url.split("?")[0].split("#")[0];
  const filename = path.split("/").pop() ?? "Custom Font";
  const base = filename.replace(/\.(woff2|woff|ttf|otf)$/i, "");
  const cleaned = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Custom Font";
}

function decodeFamilyToken(token: string): string {
  return decodeURIComponent(token).replace(/\+/g, " ").trim();
}

/**
 * Extracts the font family name if `url` is a Google Fonts link
 * (a specimen page like fonts.google.com/specimen/Roboto, or a css2/css
 * stylesheet link like fonts.googleapis.com/css2?family=Roboto). Returns
 * null for anything else (e.g. a direct font file URL).
 */
export function parseGoogleFontsUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "fonts.google.com") {
    const match = url.pathname.match(/\/specimen\/([^/]+)/);
    return match ? decodeFamilyToken(match[1]) : null;
  }

  if (host === "fonts.googleapis.com") {
    const family = url.searchParams.get("family");
    if (!family) return null;
    // family can be "Roboto:wght@400;700", "Roboto:ital,wght@0,400", or
    // (legacy css1 API) multiple families separated by "|" — take the first.
    const first = family.split("|")[0]?.split(":")[0];
    return first ? decodeFamilyToken(first) : null;
  }

  return null;
}
