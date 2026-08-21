/**
 * User-chosen export defaults, persisted in localStorage. The settings page
 * writes them; the editor's export dialog seeds its controls from them.
 */

export type ExportDefaults = {
  resolution: "720" | "1080";
  format: "mp4" | "webm";
  subtitleBurnIn: boolean;
};

const STORAGE_KEY = "export-defaults";

export const FALLBACK_EXPORT_DEFAULTS: ExportDefaults = {
  resolution: "1080",
  format: "mp4",
  subtitleBurnIn: true,
};

export function loadExportDefaults(): ExportDefaults {
  if (typeof window === "undefined") return FALLBACK_EXPORT_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return FALLBACK_EXPORT_DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      resolution: parsed.resolution === "720" ? "720" : "1080",
      format: parsed.format === "webm" ? "webm" : "mp4",
      subtitleBurnIn:
        typeof parsed.subtitleBurnIn === "boolean"
          ? parsed.subtitleBurnIn
          : true,
    };
  } catch {
    return FALLBACK_EXPORT_DEFAULTS;
  }
}

export function saveExportDefaults(defaults: ExportDefaults) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    // localStorage unavailable (private mode etc.) — defaults just won't persist
  }
}
