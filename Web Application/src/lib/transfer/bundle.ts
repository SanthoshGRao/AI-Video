/**
 * `.aivproj` project bundle — the interchange format for "export a project here,
 * import it into any other account and keep working".
 *
 * Physically a ZIP:
 *
 *   manifest.json          format version, source app version, counts
 *   project.json           the whole project graph, original ids intact
 *   files/media/<id><ext>  every MediaAsset binary
 *   files/audio/<id><ext>  every AudioAsset binary
 *
 * Ids are exported *as they were*. Import rewrites every one of them and
 * repoints the timeline, because two accounts can hold the same cuid only by
 * accident and a re-import into the same account must not collide.
 */

export const BUNDLE_FORMAT_VERSION = 1;
export const BUNDLE_EXTENSION = ".aivproj";
export const MANIFEST_ENTRY = "manifest.json";
export const PROJECT_ENTRY = "project.json";
export const MEDIA_PREFIX = "files/media/";
export const AUDIO_PREFIX = "files/audio/";

export type BundleManifest = {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  projectTitle: string;
  /** Present only so a human peeking inside the zip can orient themselves. */
  counts: {
    scriptVersions: number;
    mediaAssets: number;
    audioAssets: number;
    timelines: number;
    subtitleTracks: number;
    contentPacks: number;
    mediaFolders: number;
  };
  /** Bytes of bundled media, for the import progress estimate. */
  totalFileBytes: number;
};

export type BundledMediaAsset = {
  id: string;
  mediaFolderId: string | null;
  type: string;
  originalName: string;
  r2Key: string;
  r2Url: string;
  thumbnailUrl: string | null;
  thumbnailR2Key: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: string;
  tags: Array<{ tag: string; confidence: number; source: string }>;
  /** Entry name inside the zip, or null when the binary could not be read. */
  file: string | null;
};

export type BundledAudioAsset = {
  id: string;
  scriptVersionId: string | null;
  voiceType: string;
  voiceStyleLabel: string | null;
  r2Key: string;
  r2Url: string;
  durationMs: number;
  waveformData: unknown;
  wordTimestamps: unknown;
  createdAt: string;
  file: string | null;
};

export type BundledProject = {
  title: string;
  templateSlug: string | null;
  propertyData: unknown;
  extractedFacts: unknown;
  validatedFacts: unknown;
  targetAudience: string | null;
  language: string;
  tone: string;
  ctaStyle: string;
  durationSeconds: number;
  status: string;

  scriptVersions: Array<{
    id: string;
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
    factCheckReport: unknown;
    createdAt: string;
  }>;

  mediaFolders: Array<{
    id: string;
    parentFolderId: string | null;
    name: string;
    description: string | null;
    createdAt: string;
  }>;

  mediaAssets: BundledMediaAsset[];
  audioAssets: BundledAudioAsset[];

  subtitleTracks: Array<{
    id: string;
    audioAssetId: string | null;
    language: string;
    cues: unknown;
    stylePreset: string;
    customStyle: unknown;
    isBurntIn: boolean;
    createdAt: string;
  }>;

  timelines: Array<{
    id: string;
    version: number;
    tracks: unknown;
    clips: unknown;
    transitions: unknown;
    textLayers: unknown;
    settings: unknown;
    isAutosave: boolean;
    isAiGenerated: boolean;
    createdAt: string;
  }>;

  contentPacks: Array<{
    id: string;
    version: number;
    instagramCaptions: unknown;
    facebookCopies: unknown;
    whatsappCopies: unknown;
    telegramCopy: unknown;
    youtubeDescriptions: unknown;
    ctaVariations: unknown;
    hashtagSets: unknown;
    seoMetadata: unknown;
    propertyHighlights: unknown;
    googleBusinessPost: unknown;
    selectedPlatforms: unknown;
    isActive: boolean;
    createdAt: string;
  }>;
};

/** Filesystem-safe file stem for the downloaded bundle. */
export function bundleFileName(title: string): string {
  const slug =
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .toLowerCase() || "project";
  return `${slug}${BUNDLE_EXTENSION}`;
}
