import type { NativeProject } from "../model/types";

export interface ExportOptions {
  projectId: string;
  format: "mp4" | "mov" | "webm";
  aspectRatio: string;
  /** e.g. "1080p", "720p" */
  resolution: string;
  subtitleBurnIn: boolean;
  /** Which SubtitleTrack row to burn in, when subtitleBurnIn is true. */
  subtitleTrackId?: string;
  /** Current in-editor state (possibly unsaved) — exported exactly as
   * previewed, rather than re-reading a possibly-stale DB row, so the
   * export can never diverge from what the user is looking at. */
  project: NativeProject;
}

export const RESOLUTION_HEIGHTS: Record<string, number> = {
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "2160p": 2160,
};
