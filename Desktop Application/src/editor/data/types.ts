/**
 * types.ts — hand-maintained "shadow schema" for the 6 Prisma models the
 * native editor touches: User, Project, Timeline, MediaAsset, AudioAsset,
 * SubtitleTrack, ExportJob.
 *
 * Desktop Application has no Prisma client of its own (see data/pool.ts) —
 * this file is the data-contract mirror of the relevant slice of
 * Web Application/prisma/schema.prisma. Whenever that schema changes any
 * of these models, update this file to match.
 */

export interface UserRow {
  id: string;
  googleId: string | null;
  email: string;
  name: string | null;
}

export interface ProjectRow {
  id: string;
  userId: string;
  title: string;
  status: string;
  language: string;
  durationSeconds: number;
  updatedAt: string;
}

export interface TimelineRowDb {
  id: string;
  projectId: string;
  version: number;
  tracks: unknown;
  clips: unknown;
  transitions: unknown | null;
  textLayers: unknown | null;
  settings: unknown | null;
  isAutosave: boolean;
  isAiGenerated: boolean;
  createdAt: string;
}

export interface MediaAssetRow {
  id: string;
  projectId: string | null;
  userId: string | null;
  type: string;
  originalName: string;
  localPath: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  mimeType: string;
}

export interface AudioAssetRow {
  id: string;
  projectId: string;
  voiceType: string;
  localPath: string | null;
  durationMs: number;
  waveformData: unknown | null;
  wordTimestamps: unknown | null;
}

export interface SubtitleTrackRow {
  id: string;
  projectId: string;
  audioAssetId: string | null;
  language: string;
  cues: unknown;
  stylePreset: string;
  customStyle: unknown | null;
}

export type ExportStatus = "QUEUED" | "RENDERING" | "DONE" | "FAILED";

export interface ExportJobRow {
  id: string;
  projectId: string;
  status: ExportStatus;
  format: string;
  aspectRatio: string;
  resolution: string;
  subtitleBurnIn: boolean;
  watermark: boolean;
  downloadUrl: string | null;
  fileSizeBytes: number | null;
  renderProgress: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
