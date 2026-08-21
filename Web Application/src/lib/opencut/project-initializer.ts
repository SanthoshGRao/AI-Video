import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { OpenCutProject } from "@/opencut/types";
import type { Project, AudioAsset, SubtitleTrackData, MediaAsset, ScriptVersion } from "@/types";
import { openCutProjectMapper, type GeneratedAssetsData } from "./project-mapper";
import { openCutProjectToTimelineDocument } from "@/opencut/generated-assets-mapper";
import { assertValidTimeline } from "@/lib/timeline/validate";

/**
 * Retry once on a Postgres serialization failure (Prisma P2034) — the
 * expected, recoverable outcome of two concurrent SERIALIZABLE writers
 * racing on the same project's timeline (e.g. this initial save racing
 * the editor's first autosave right after the page mounts).
 */
async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return await fn();
    }
    throw error;
  }
}

/**
 * OpenCutProjectInitializer
 *
 * Orchestrates the complete project initialization workflow.
 *
 * Responsibilities:
 * - Load project and all associated data from database
 * - Validate that project is ready for editing
 * - Coordinate mapper to build OpenCut project
 * - Handle missing or incomplete data gracefully
 * - Return production-ready OpenCut project
 *
 * Validation Checklist:
 * ✓ Project exists
 * ✓ Audio/voiceover generated
 * ✓ Subtitles generated
 * ✓ Script version approved or generated
 * ✓ Timeline settings exist
 * ✓ Media assets uploaded (optional but recommended)
 */
export class OpenCutProjectInitializer {
  /**
   * Initialize complete OpenCut project
   */
  async initializeProject(projectId: string): Promise<OpenCutProject> {
    // Load all project data
    const assets = await this.loadGeneratedAssets(projectId);

    // Validate essential data
    this.validateProjectReadiness(assets);

    // Map to OpenCut format
    const openCutProject = await openCutProjectMapper.mapToOpenCutProject(assets);

    // Save project reference (for persistence later)
    await this.saveProjectReference(projectId, openCutProject);

    // Save initial timeline to database
    await this.saveInitialTimeline(projectId, openCutProject);

    return openCutProject;
  }

  /**
   * Save initial timeline structure to database
   */
  private async saveInitialTimeline(projectId: string, project: OpenCutProject): Promise<void> {
    try {
      const doc = openCutProjectToTimelineDocument(project);
      assertValidTimeline(doc);

      const payload = {
        tracks: doc.tracks as any,
        clips: doc.clips as any,
        transitions: doc.transitions as any,
        textLayers: doc.textLayers as any,
        settings: doc.settings as any,
        isAutosave: false,
      };

      await withSerializableRetry(() =>
        prisma.$transaction(
          async (tx) => {
            const existing = await tx.timeline.findFirst({
              where: { projectId },
              orderBy: [{ version: "desc" }, { createdAt: "desc" }],
            });

            // Only ever create the *first* timeline for a project here. This
            // endpoint re-runs on every voiceover (re)generation from Content
            // Studio — if a timeline already exists, it holds whatever the
            // user has since edited in editor-v2 (added media, titles,
            // trims). Overwriting it with a freshly regenerated OpenCut doc
            // silently deleted all of that on the next voiceover regen.
            if (existing) return existing;
            return tx.timeline.create({
              data: {
                projectId,
                version: 1,
                ...payload,
                isAiGenerated: true,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )
      );
    } catch (error) {
      console.error("Failed to save initial timeline:", error);
    }
  }

  /**
   * Load all generated assets from database
   */
  private async loadGeneratedAssets(projectId: string): Promise<GeneratedAssetsData> {
    // Load project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            scriptVersions: true,
            mediaAssets: true,
            exportJobs: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Load active script version
    const scriptVersion = await prisma.scriptVersion.findFirst({
      where: {
        projectId,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!scriptVersion) {
      throw new Error(`No active script version found for project: ${projectId}`);
    }

    // Load audio asset
    const audioAsset = await prisma.audioAsset.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    if (!audioAsset) {
      throw new Error(`No audio asset found for project: ${projectId}`);
    }

    // Load subtitle data
    const subtitleRow = await prisma.subtitleTrack.findFirst({
      where: { projectId },
    });

    // Convert subtitleRow to SubtitleTrackData format
    let subtitleData: SubtitleTrackData | null = null;
    if (subtitleRow) {
      subtitleData = {
        id: subtitleRow.id,
        projectId: subtitleRow.projectId,
        audioAssetId: subtitleRow.audioAssetId,
        language: subtitleRow.language,
        cues: Array.isArray(subtitleRow.cues) ? subtitleRow.cues as unknown as SubtitleTrackData["cues"] : [],
        stylePreset: subtitleRow.stylePreset || "instagram_reels",
        customStyle: subtitleRow.customStyle as unknown as SubtitleTrackData["customStyle"],
        isBurntIn: subtitleRow.isBurntIn,
      };
    }

    // Load media assets
    const mediaRows = await prisma.mediaAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    // Get or create timeline settings
    let timelineSettings = await this.loadTimelineSettings(projectId);
    if (!timelineSettings) {
      timelineSettings = this.createDefaultTimelineSettings();
    }

    return {
      project: project as unknown as Project,
      audioAsset: audioAsset as unknown as AudioAsset,
      subtitleData,
      mediaAssets: mediaRows as unknown as MediaAsset[],
      scriptVersion: scriptVersion as unknown as ScriptVersion,
      timelineSettings,
    };
  }

  /**
   * Load timeline settings from database
   */
  private async loadTimelineSettings(projectId: string) {
    const timeline = await prisma.timeline.findFirst({
      where: { projectId },
      select: { settings: true },
    });

    return timeline?.settings ? (timeline.settings as unknown as import("@/types").TimelineSettings) : null;
  }

  /**
   * Create default timeline settings
   */
  private createDefaultTimelineSettings() {
    return {
      width: 1920,
      height: 1080,
      fps: 30,
      durationMs: 0, // Will be set to audio duration
      backgroundColor: "#000000",
    };
  }

  /**
   * Validate project is ready for editing
   */
  private validateProjectReadiness(assets: GeneratedAssetsData): void {
    // Check audio
    if (!assets.audioAsset) {
      throw new Error("Project is not ready: Voiceover has not been generated");
    }

    // Check script
    if (!assets.scriptVersion || !assets.scriptVersion.content) {
      throw new Error("Project is not ready: Script has not been generated");
    }

    // Check that audio duration is valid
    if (assets.audioAsset.durationMs <= 0) {
      throw new Error("Project is not ready: Audio has invalid duration");
    }

    // Note: Subtitles and media are optional
    if (!assets.subtitleData) {
      console.warn("Warning: Project has no subtitles (optional)");
    }

    if (!assets.mediaAssets || assets.mediaAssets.length === 0) {
      console.warn("Warning: Project has no media assets (optional)");
    }
  }

  /**
   * Save project reference for later persistence
   *
   * This creates a record linking the OpenCut project to the original project,
   * useful for tracking editing state and save history.
   */
  private async saveProjectReference(projectId: string, project: OpenCutProject): Promise<void> {
    try {
      // Update project status to EDITING
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: "EDITING",
          lastSavedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Failed to save project reference:", error);
      // Don't throw - this is non-critical for initialization
    }
  }

  /**
   * Get project readiness status
   *
   * Useful for checking what's missing before initializing editor
   */
  async getProjectReadinessStatus(projectId: string): Promise<{
    ready: boolean;
    voiceReady: boolean;
    scriptReady: boolean;
    subtitlesReady: boolean;
    mediaReady: boolean;
    missingItems: string[];
  }> {
    const assets = await this.loadGeneratedAssets(projectId).catch(() => null);

    if (!assets) {
      return {
        ready: false,
        voiceReady: false,
        scriptReady: false,
        subtitlesReady: false,
        mediaReady: false,
        missingItems: ["Project not found or incomplete"],
      };
    }

    const missingItems: string[] = [];

    const voiceReady = !!assets.audioAsset && assets.audioAsset.durationMs > 0;
    if (!voiceReady) missingItems.push("Voiceover");

    const scriptReady = !!assets.scriptVersion && assets.scriptVersion.content.length > 0;
    if (!scriptReady) missingItems.push("Script");

    const subtitlesReady = !!assets.subtitleData && assets.subtitleData.cues.length > 0;
    if (!subtitlesReady) missingItems.push("Subtitles (optional)");

    const mediaReady = assets.mediaAssets && assets.mediaAssets.length > 0;
    if (!mediaReady) missingItems.push("Media Assets (optional)");

    const ready = voiceReady && scriptReady;

    return {
      ready,
      voiceReady,
      scriptReady,
      subtitlesReady,
      mediaReady,
      missingItems: ready ? [] : missingItems,
    };
  }
}

/**
 * Create and export singleton instance
 */
export const openCutProjectInitializer = new OpenCutProjectInitializer();

/**
 * Factory function for getting initializer instance
 */
export function getOpenCutInitializer(): OpenCutProjectInitializer {
  return openCutProjectInitializer;
}
