/**
 * Helpers for "skit" projects — the multi-character conversation flow. A skit
 * project stores its entire working state inside `Project.propertyData` (a JSON
 * column) so it needs no schema change:
 *
 *   propertyData = { kind: "skit", skit: { scriptText, language, cast } }
 *
 * `cast` is a map of character name -> CastAssignment (see components/skit/types).
 */

export const SKIT_KIND = "skit" as const;

export interface SkitProjectData {
  scriptText: string;
  /** TTS language code, e.g. "kn-IN". */
  language: string;
  /** character name -> assignment; kept loosely typed here to stay dep-free. */
  cast: Record<string, unknown>;
}

/** Is this project's propertyData a skit payload? */
export function isSkitProject(propertyData: unknown): boolean {
  return (
    !!propertyData &&
    typeof propertyData === "object" &&
    (propertyData as { kind?: unknown }).kind === SKIT_KIND
  );
}

/** Pull the skit payload (with safe defaults) out of a project's propertyData. */
export function readSkitData(propertyData: unknown): SkitProjectData {
  const skit =
    propertyData && typeof propertyData === "object"
      ? ((propertyData as { skit?: Partial<SkitProjectData> }).skit ?? {})
      : {};
  return {
    scriptText: typeof skit.scriptText === "string" ? skit.scriptText : "",
    language: typeof skit.language === "string" ? skit.language : "kn-IN",
    cast: skit.cast && typeof skit.cast === "object" ? (skit.cast as Record<string, unknown>) : {},
  };
}

/** Map a TTS language code to the project-level language string used elsewhere. */
export function ttsToProjectLanguage(ttsCode: string): string {
  if (ttsCode.startsWith("kn")) return "kannada_english";
  if (ttsCode.startsWith("hi")) return "hindi_english";
  return "english";
}

/** Transliteration-input language for a TTS code (inert for unsupported ones). */
export function transliterationLang(ttsCode: string): string | undefined {
  if (ttsCode.startsWith("kn")) return "kannada_english";
  if (ttsCode.startsWith("hi")) return "hindi_english";
  return undefined;
}
