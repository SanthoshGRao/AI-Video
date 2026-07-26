/**
 * export-error-taxonomy.ts — classifies a raw export failure (an
 * exception message or ffmpeg stderr tail) into a typed category with a
 * clear, user-facing message, instead of surfacing raw ffmpeg stderr
 * dumps to the export dialog. Covers the original ask's "Error Handling"
 * goal: corrupted media, missing files, unsupported codecs, GPU/encoder
 * failures, disk full.
 */

export type ExportErrorCode =
  | "MISSING_MEDIA"
  | "DISK_FULL"
  | "FFMPEG_NOT_FOUND"
  | "ENCODER_UNAVAILABLE"
  | "CORRUPT_MEDIA"
  | "PERMISSION_DENIED"
  | "ENCODER_CRASHED"
  | "CANCELLED"
  | "UNKNOWN";

export interface ClassifiedExportError {
  code: ExportErrorCode;
  userMessage: string;
  raw: string;
}

const RULES: Array<{ code: ExportErrorCode; pattern: RegExp; userMessage: string }> = [
  { code: "CANCELLED", pattern: /export cancelled/i, userMessage: "Export was cancelled." },
  {
    code: "FFMPEG_NOT_FOUND",
    pattern: /ENOENT|not found|is not recognized as an internal/i,
    userMessage: "ffmpeg could not be found. Reinstall the app or check Desktop Application/resources/ffmpeg.",
  },
  {
    code: "DISK_FULL",
    pattern: /ENOSPC|no space left/i,
    userMessage: "Ran out of disk space while exporting. Free up space and try again.",
  },
  {
    code: "PERMISSION_DENIED",
    pattern: /EACCES|EPERM|permission denied/i,
    userMessage: "Permission denied writing the export file. Check the storage folder's permissions.",
  },
  {
    code: "ENCODER_UNAVAILABLE",
    // Also covers NVENC failing at runtime rather than at load: driver/session
    // limits and out-of-memory report through OpenEncodeSessionEx.
    pattern:
      /encoder not found|unknown encoder|cannot load .*nvenc|cannot load .*qsv|cannot load .*amf|openencodesessionex failed|no capable devices|nvenc .*(not available|error)|out of memory/i,
    // Encoder selection now test-encodes before committing (ffmpeg-locate.ts),
    // so a machine that can't use its GPU encoder lands on libx264 up front.
    // Reaching this rule means the encoder worked at startup and failed later.
    userMessage:
      "The hardware video encoder failed part-way through the export. Close other GPU-heavy apps and try again — the app will fall back to software encoding if the GPU encoder stops working.",
  },
  {
    code: "CORRUPT_MEDIA",
    pattern: /invalid data found|moov atom not found|could not find codec parameters|error while decoding/i,
    userMessage: "One of the media files in this project appears to be corrupted or uses an unsupported codec.",
  },
  {
    code: "MISSING_MEDIA",
    pattern: /no such file or directory|unable to find a suitable output format|does not exist|matches no streams/i,
    userMessage: "A media file referenced by this project is missing from disk.",
  },
  {
    code: "ENCODER_CRASHED",
    // The encoder process went away mid-export. Matched last so the more
    // specific causes above (disk full, encoder unavailable, corrupt input)
    // win when ffmpeg said something more useful before dying.
    pattern: /encoder ffmpeg exited with code|encoder stdin is closed|EPIPE|broken pipe|conversion failed/i,
    userMessage:
      "The video encoder stopped unexpectedly during the export. The log line for this failure contains ffmpeg's own error message.",
  },
];

export function classifyExportError(raw: string): ClassifiedExportError {
  for (const rule of RULES) {
    if (rule.pattern.test(raw)) {
      return { code: rule.code, userMessage: rule.userMessage, raw };
    }
  }
  return { code: "UNKNOWN", userMessage: "Export failed for an unknown reason — see logs for details.", raw };
}
