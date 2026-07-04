/**
 * Editor Integration Contract
 * ---------------------------
 * Single source of truth for the data the editor consumes from the host app.
 * The editor never talks to PostgreSQL, Supabase, R2, or any REST API directly.
 * The host implements `loadProjectBundle` / `saveTimeline` in src/editor/adapter.ts.
 *
 * These types intentionally mirror the upstream domain models
 * (Project, ScriptVersion, AudioAsset, SubtitleTrack, MediaAsset, ExtractedFacts)
 * so the adapter is a thin mapping layer.
 */

export type ID = string;
export type Seconds = number;

export interface Project {
  id: ID;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Optional output resolution preference (defaults to 1920x1080) */
  width?: number;
  height?: number;
  fps?: number;
}

export interface ScriptVersion {
  id: ID;
  projectId: ID;
  version: number;
  approved: boolean;
  /** Plain narration text, possibly multi-paragraph */
  content: string;
  /**
   * Optional pre-segmented narration. If absent the timeline builder
   * splits `content` heuristically (paragraphs → sentences).
   */
  segments?: ScriptSegment[];
}

export interface ScriptSegment {
  id: ID;
  text: string;
  /** Optional anchor in audio if available from TTS alignment */
  start?: Seconds;
  end?: Seconds;
}

export interface AudioAsset {
  id: ID;
  projectId: ID;
  /** Public/signed URL to the rendered Gemini TTS narration */
  url: string;
  duration: Seconds;
  /** Optional pre-computed peaks for waveform rendering */
  peaks?: number[];
  mimeType?: string;
}

export interface SubtitleCue {
  id: ID;
  start: Seconds;
  end: Seconds;
  text: string;
  /** Optional per-word timings for karaoke / highlight modes */
  words?: Array<{ text: string; start: Seconds; end: Seconds }>;
}

export interface SubtitleTrack {
  id: ID;
  projectId: ID;
  language: string;
  cues: SubtitleCue[];
}

/** Free-form key/value bag, exactly as the fact-extraction step produces. */
export type ExtractedFacts = Record<string, string | number | boolean | null>;

export type MediaKind = "video" | "image";

export interface MediaAsset {
  id: ID;
  projectId: ID;
  kind: MediaKind;
  name: string;
  url: string;
  thumbnailUrl?: string;
  /** Required for video, optional for image */
  duration?: Seconds;
  width?: number;
  height?: number;
  mimeType?: string;
  /** Optional ordering hint from the upload step */
  order?: number;
  /** Optional tag, e.g. "broll", "hero" */
  tag?: string;
}

export interface ProjectBundle {
  project: Project;
  scriptVersion: ScriptVersion;
  audioAsset: AudioAsset;
  subtitleTrack: SubtitleTrack;
  extractedFacts: ExtractedFacts;
  mediaAssets: MediaAsset[];
}

/**
 * Host-implemented adapter functions. Swap these implementations to
 * wire the editor into the real backend; nothing else needs to change.
 */
export interface EditorAdapter {
  loadProjectBundle(projectId: ID): Promise<ProjectBundle>;
  saveTimeline(projectId: ID, timeline: unknown): Promise<void>;
}
