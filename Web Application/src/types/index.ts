// ============================================
// Type Definitions — Project & Core Entities
// ============================================

// ---- User ----
export type Plan = "FREE" | "PRO" | "ENTERPRISE";

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: Plan;
  creditsUsed: number;
  creditsLimit: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Brand Kit ----
export interface BrandKit {
  id: string;
  userId: string;
  companyName: string | null;
  logoUrl: string | null;
  watermarkUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  phoneNumber: string | null;
  whatsappNumber: string | null;
  ctaFooter: string | null;
  website: string | null;
}

// ---- Property Template ----
export interface PropertyTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  focusAreas: string[];
  isActive: boolean;
  sortOrder: number;
}

// ---- Prompt Chip ----
export type ChipCategory = "TONE" | "AUDIENCE" | "STYLE" | "FEATURE";

export interface PromptChip {
  id: string;
  label: string;
  prompt: string;
  category: ChipCategory;
  icon: string | null;
  sortOrder: number;
}

// ---- Project ----
export type ProjectStatus =
  | "DRAFT"
  | "CONTENT_READY"
  | "MEDIA_UPLOADED"
  | "EDITING"
  | "RENDERING"
  | "EXPORTED"
  | "ARCHIVED";

export interface Project {
  id: string;
  userId: string;
  /** Workspace the project is filed under; null means the creator's Personal. */
  workspaceId: string | null;
  templateId: string | null;
  title: string;
  status: ProjectStatus;
  propertyData: Record<string, unknown> | null;
  extractedFacts: ExtractedFacts | null;
  validatedFacts: ExtractedFacts | null;
  targetAudience: string | null;
  language: string;
  tone: string;
  ctaStyle: string;
  durationSeconds: number;
  lastSavedAt: string;
  createdAt: string;
  updatedAt: string;
  template?: PropertyTemplate | null;
  _count?: {
    scriptVersions: number;
    mediaAssets: number;
    exportJobs: number;
  };
}

// ---- Extracted Facts ----
export interface ExtractedFacts {
  location: string;
  distances: { place: string; km: number }[];
  plotSize: string;
  price: string;
  priceUnit: string;
  roadAccess: string;
  water: string[];
  electricity: boolean;
  legal: string[];
  plantation: { type: string; count: number }[];
  irrigation: string;
  propertyType: string;
  nearbyLandmarks: string[];
  additionalFeatures: string[];
}

// ---- Script Version ----
export type VariationStyle =
  | "premium_professional"
  | "investment_focus"
  | "urgency_style"
  | "farmhouse_lifestyle"
  | "luxury_estate";

export interface ScriptVersion {
  id: string;
  projectId: string;
  generationBatch: number;
  versionNumber: number;
  variationStyle: string;
  content: string;
  language: string;
  wordCount: number;
  estimatedDuration: number;
  isApproved: boolean;
  isActive: boolean;
  factCheckPassed: boolean;
  factCheckReport: FactCheckReport | null;
  createdAt: string;
}

export interface FactCheckReport {
  passed: boolean;
  issues: {
    field: string;
    expected: string;
    found: string;
    severity: "error" | "warning";
  }[];
}

// ---- Audio Asset ----
export interface AudioAsset {
  id: string;
  projectId: string;
  scriptVersionId: string | null;
  voiceType: string;
  r2Url: string;
  durationMs: number;
  waveformData: number[] | null;
  wordTimestamps: AudioSyncPayload | null;
  createdAt: string;
}

export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number;
}

export interface SentenceTimestamp {
  text: string;
  start: number;
  end: number;
}

export type AudioSyncSource = "whisperx" | "google-stt" | "google_speech" | "estimated" | "stable-ts";

export interface AudioSyncPayload {
  version: 1;
  words: WordTimestamp[];
  sentences: SentenceTimestamp[];
  syncSource: AudioSyncSource;
}

// ---- Media Asset ----
export type MediaType = "IMAGE" | "VIDEO" | "DRONE" | "LOGO" | "DOCUMENT";

export interface MediaAsset {
  id: string;
  projectId: string;
  type: MediaType;
  originalName: string;
  r2Url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: string;
  mediaTags?: MediaTag[];
}

export interface MediaTag {
  id: string;
  mediaAssetId: string;
  tag: string;
  confidence: number;
  source: "ai" | "manual";
}

// ---- Content Pack ----
export interface ContentPack {
  id: string;
  projectId: string;
  version: number;
  instagramCaptions: string[] | null;
  facebookCopies: string[] | null;
  whatsappCopies: string[] | null;
  telegramCopy: string | null;
  youtubeDescriptions: string[] | null;
  ctaVariations: string[] | null;
  hashtagSets: {
    set10: string[];
    set20: string[];
    set30: string[];
  } | null;
  seoMetadata: {
    title: string;
    description: string;
    keywords: string[];
  } | null;
  propertyHighlights: string[] | null;
  googleBusinessPost: string | null;
  isActive: boolean;
  createdAt: string;
}

// ---- Timeline ----
export interface TimelineData {
  id: string;
  projectId: string;
  version: number;
  tracks: Track[];
  clips: Record<string, Clip>;
  transitions: Transition[];
  textLayers: TextLayer[];
  settings: TimelineSettings;
  isAutosave: boolean;
  isAiGenerated: boolean;
  createdAt: string;
}

export interface Track {
  id: string;
  type: "video" | "audio" | "voiceover" | "text" | "subtitle";
  name: string;
  muted: boolean;
  locked: boolean;
  clipIds: string[];
}

export interface Clip {
  id: string;
  trackId: string;
  mediaAssetId?: string;
  audioAssetId?: string;
  type: "video" | "image" | "audio" | "text";
  startTime: number; // ms
  endTime: number;
  trimStart: number;
  trimEnd: number;
  properties: Record<string, unknown>;
}

export interface Transition {
  id: string;
  type: "fade" | "zoom" | "slide" | "blur" | "push";
  clipAId: string;
  clipBId: string;
  durationMs: number;
}

export interface TextLayer {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style: Record<string, unknown>;
  animation: string;
  position: { x: number; y: number };
}

export interface TimelineSettings {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  backgroundColor: string;
}

// ---- Subtitle Track ----
export interface SubtitleTrackData {
  id: string;
  projectId: string;
  audioAssetId: string | null;
  language: string;
  cues: SubtitleCue[];
  stylePreset: string;
  customStyle: SubtitleStyle | null;
  isBurntIn: boolean;
}

export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words: {
    word: string;
    startMs: number;
    endMs: number;
  }[];
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  position: "top" | "center" | "bottom";
  animation: "none" | "fade" | "word_pop" | "highlight" | "karaoke";
  highlightColor: string;
  stroke: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
}

// ---- Export Job ----
export type ExportStatus =
  | "QUEUED"
  | "PROCESSING"
  | "RENDERING"
  | "POST_PROCESSING"
  | "UPLOADING"
  | "DONE"
  | "FAILED";

export interface ExportJob {
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

// ---- Analytics ----
export interface AnalyticsEvent {
  id: string;
  userId: string;
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AnalyticsSummary {
  totalProjects: number;
  totalExports: number;
  totalScripts: number;
  totalTTSGenerated: number;
  mostUsedTemplate: string | null;
  mostUsedVoice: string | null;
  mostExportedFormat: string | null;
  monthlyExports: { month: string; count: number }[];
  popularPropertyTypes: { type: string; count: number }[];
}
