import type { NativeProject } from "../../src/editor/model/types";

export interface LoadedMedia {
  id: string;
  type: string;
  originalName: string;
  url: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  mimeType: string;
}

export interface LoadedAudio {
  id: string;
  voiceType: string;
  url: string | null;
  durationMs: number | null;
  waveformData: unknown;
}

export interface LoadedSubtitleTrack {
  id: string;
  language: string;
  cues: unknown;
  stylePreset: string;
  customStyle: unknown;
}

export interface EditorLoadPayload {
  project: { id: string; title: string; language: string };
  timeline: NativeProject;
  /** A locally-saved crash-recovery snapshot newer than the DB row, if any. */
  recoverySnapshot: NativeProject | null;
  media: LoadedMedia[];
  audio: LoadedAudio[];
  subtitles: LoadedSubtitleTrack[];
  subtitleTrackId: string | null;
}

export interface ExportOptionsPayload {
  projectId: string;
  format: "mp4" | "mov" | "webm";
  aspectRatio: string;
  resolution: string;
  subtitleBurnIn: boolean;
  subtitleTrackId?: string;
  project: NativeProject;
}

export interface ExportJobStatus {
  id: string;
  status: "QUEUED" | "RENDERING" | "DONE" | "FAILED";
  renderProgress: number;
  downloadUrl: string | null;
  errorMessage: string | null;
}

export interface EditorAPI {
  load(projectId: string): Promise<EditorLoadPayload>;
  save(payload: {
    projectId: string;
    timeline: NativeProject;
    isAutosave: boolean;
    bumpVersion: boolean;
  }): Promise<{ timelineId: string; version: number }>;
  exportStart(options: ExportOptionsPayload): Promise<{ jobId: string }>;
  exportStatus(jobId: string): Promise<ExportJobStatus | null>;
  exportCancel(jobId: string): Promise<boolean>;
  getThumbnail(mediaAssetId: string): Promise<string | null>;
  saveRecoverySnapshot(payload: { projectId: string; timeline: NativeProject; timelineVersion: number }): void;
  onExportProgress(callback: (jobId: string, percent: number) => void): () => void;
  windowControls: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
  };
}

declare global {
  interface Window {
    editorAPI: EditorAPI;
  }
}
