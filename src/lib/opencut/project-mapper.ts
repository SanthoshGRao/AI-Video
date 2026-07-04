import type { Project, AudioAsset, SubtitleTrackData, ExtractedFacts, MediaAsset, TimelineSettings, ScriptVersion, AudioSyncPayload } from "@/types";
import type { OpenCutProject, OpenCutScene, OpenCutTrack, OpenCutMediaAsset } from "@/opencut/types";
import { voiceTrackBuilder } from "./voice-track-builder";
import { subtitleTrackBuilder } from "./subtitle-track-builder";
import { factOverlayBuilder } from "./fact-overlay-builder";
import { mediaTrackBuilder } from "./media-track-builder";

/**
 * GeneratedAssetsData - container for all generated project assets
 */
export interface GeneratedAssetsData {
  project: Project;
  audioAsset: AudioAsset | null;
  subtitleData: SubtitleTrackData | null;
  mediaAssets: MediaAsset[];
  scriptVersion: ScriptVersion;
  timelineSettings: TimelineSettings;
}

/**
 * OpenCutProjectMapper
 *
 * Main orchestrator for converting generated assets to OpenCut project.
 *
 * Workflow:
 * 1. Load all generated assets from database
 * 2. Validate completeness (audio, subtitles ready)
 * 3. Build each track type:
 *    - Voice track from audio asset
 *    - Subtitle track from subtitle data
 *    - Fact overlays from extracted facts
 *    - Media tracks from uploaded media
 * 4. Combine all tracks into scene
 * 5. Create complete OpenCut project
 * 6. Return ready-to-edit project
 *
 * Responsibilities:
 * - Coordinate all track builders
 * - Validate data integrity
 * - Create cohesive OpenCut project
 * - Handle error cases gracefully
 * - Maintain timing consistency
 */
export class OpenCutProjectMapper {
  /**
   * Map all generated assets to OpenCut project
   */
  async mapToOpenCutProject(assets: GeneratedAssetsData): Promise<OpenCutProject> {
    // Validate essential assets
    this.validateAssets(assets);

    // Build voice track (required)
    const { track: voiceTrack, mediaAsset: voiceMedia } = await voiceTrackBuilder.buildVoiceTrack(
      assets.audioAsset!
    );

    // Build subtitle track (required if available)
    let subtitleTrack: OpenCutTrack | null = null;
    if (assets.subtitleData) {
      const { track: subTrack } = await subtitleTrackBuilder.buildSubtitleTrack(assets.subtitleData);
      subtitleTrack = subTrack;
    }

    // Build fact overlays (optional)
    let factTrack: OpenCutTrack | null = null;
    if (assets.project.extractedFacts && assets.subtitleData?.cues) {
      const { track: fTrack } = await factOverlayBuilder.buildFactTrack(
        assets.project.extractedFacts,
        assets.subtitleData.cues
      );
      factTrack = fTrack;
    }

    // Build media tracks (optional)
    let videoTrack: OpenCutTrack | null = null;
    let imageTrack: OpenCutTrack | null = null;
    let mediaAssets: OpenCutMediaAsset[] = [voiceMedia];

    if (assets.mediaAssets && assets.mediaAssets.length > 0) {
      const { videoTrack: vTrack, imageTrack: iTrack, mediaAssets: mAssets } = await mediaTrackBuilder.buildMediaTracks(
        assets.mediaAssets,
        assets.audioAsset!.durationMs
      );

      videoTrack = vTrack;
      imageTrack = iTrack;
      mediaAssets = [...mediaAssets, ...mAssets];
    }

    // Combine all tracks into scene
    const scene = this.buildScene(
      voiceTrack,
      subtitleTrack,
      factTrack,
      videoTrack,
      imageTrack
    );

    // Create OpenCut project
    const openCutProject: OpenCutProject = {
      id: assets.project.id,
      name: assets.project.title,
      version: 1,
      media: mediaAssets,
      settings: {
        fps: assets.timelineSettings.fps || 30,
        canvasSize: {
          width: assets.timelineSettings.width || 1920,
          height: assets.timelineSettings.height || 1080,
        },
        background: {
          type: "color",
          color: assets.timelineSettings.backgroundColor || "#000000",
        },
      },
      scene,
      durationMs: assets.audioAsset!.durationMs,
    };

    return openCutProject;
  }

  /**
   * Validate that essential assets are present and valid
   */
  private validateAssets(assets: GeneratedAssetsData): void {
    if (!assets.project) {
      throw new Error("Project is required");
    }
    if (!assets.audioAsset) {
      throw new Error("AudioAsset is required (voiceover must be generated)");
    }
    if (assets.audioAsset.durationMs <= 0) {
      throw new Error("AudioAsset duration must be greater than 0");
    }
    if (!assets.scriptVersion) {
      throw new Error("ScriptVersion is required");
    }
    if (!assets.timelineSettings) {
      throw new Error("TimelineSettings is required");
    }
  }

  private extractAudioSync(audioAsset: AudioAsset): AudioSyncPayload | null {
    if (!audioAsset.wordTimestamps) {
      return null;
    }

    if (Array.isArray(audioAsset.wordTimestamps)) {
      const words = audioAsset.wordTimestamps as any[];
      return {
        version: 1,
        words: words.map(w => ({ word: w.word, start: w.start, end: w.end })),
        sentences: this.buildSentencesFromWords(words),
        syncSource: "stable-ts" as any,
      };
    }

    // Already in AudioSyncPayload format
    return audioAsset.wordTimestamps as AudioSyncPayload;
  }

  /**
   * Build sentence data from words
   */
  private buildSentencesFromWords(words: Array<{ word: string; start: number; end: number }>) {
    const sentences = [];
    let currentSentence = "";
    let sentenceStart = words[0]?.start || 0;

    for (const word of words) {
      currentSentence += (currentSentence ? " " : "") + word.word;

      // Check if word ends a sentence (ends with punctuation)
      if (word.word.match(/[.!?]$/)) {
        sentences.push({
          text: currentSentence,
          start: sentenceStart,
          end: word.end,
        });
        currentSentence = "";
        sentenceStart = word.end;
      }
    }

    // Add remaining sentence if any
    if (currentSentence) {
      sentences.push({
        text: currentSentence,
        start: sentenceStart,
        end: words[words.length - 1]?.end || sentenceStart,
      });
    }

    return sentences;
  }

  /**
   * Build OpenCut scene with all tracks
   */
  private buildScene(
    voiceTrack: OpenCutTrack,
    subtitleTrack: OpenCutTrack | null,
    factTrack: OpenCutTrack | null,
    videoTrack: OpenCutTrack | null,
    imageTrack: OpenCutTrack | null
  ): OpenCutScene {
    const mainTrack = videoTrack || {
      id: "default-video-track",
      name: "Video",
      type: "video",
      elements: [],
      muted: false,
      hidden: false,
    };

    const overlayTracks: OpenCutTrack[] = [];
    if (subtitleTrack) overlayTracks.push(subtitleTrack);
    if (factTrack) overlayTracks.push(factTrack);
    if (imageTrack) overlayTracks.push(imageTrack);

    const audioTracks = [voiceTrack];

    return {
      id: `scene-main-${Math.random().toString(36).slice(2, 7)}`,
      name: "Main Scene",
      isMain: true,
      tracks: {
        main: mainTrack,
        overlay: overlayTracks,
        audio: audioTracks,
      },
      bookmarks: [],
    };
  }
}

/**
 * Create and export singleton instance
 */
export const openCutProjectMapper = new OpenCutProjectMapper();
