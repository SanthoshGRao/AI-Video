/**
 * OpenCut Integration Library
 *
 * This library provides adapters and builders for converting
 * the application's generated assets into OpenCut project format.
 *
 * Main Components:
 * - VoiceTrackBuilder: Builds audio track from narration
 * - SubtitleTrackBuilder: Builds subtitle track from cues
 * - FactOverlayBuilder: Builds fact overlay track
 * - MediaTrackBuilder: Builds video/image tracks
 * - OpenCutProjectMapper: Orchestrates all builders
 * - OpenCutProjectInitializer: Complete project initialization
 *
 * Usage:
 * const initializer = new OpenCutProjectInitializer();
 * const openCutProject = await initializer.initializeProject(projectId);
 */

// Re-export all builders
export { VoiceTrackBuilder, voiceTrackBuilder } from "./voice-track-builder";
export { SubtitleTrackBuilder, subtitleTrackBuilder } from "./subtitle-track-builder";
export { FactOverlayBuilder, factOverlayBuilder, type FactTiming } from "./fact-overlay-builder";
export { MediaTrackBuilder, mediaTrackBuilder, type MediaPlacement } from "./media-track-builder";

// Re-export mapper
export { OpenCutProjectMapper, openCutProjectMapper, type GeneratedAssetsData } from "./project-mapper";

// Re-export initializer
export {
  OpenCutProjectInitializer,
  openCutProjectInitializer,
  getOpenCutInitializer,
} from "./project-initializer";

// Re-export types
export type { OpenCutProject, OpenCutScene, OpenCutTrack, OpenCutMediaAsset } from "@/opencut/types";
