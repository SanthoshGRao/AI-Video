import type { AudioAsset } from "@/types";
import type {
  OpenCutAudioElement,
  OpenCutMediaAsset,
  OpenCutTrack,
} from "@/opencut/types";

/**
 * VoiceTrackBuilder
 *
 * Automatically creates an audio track for the narration.
 *
 * Responsibilities:
 * - Create a voice/audio media asset from AudioAsset
 * - Generate or preserve waveform data for visualization
 * - Position audio at timeline start (time 0)
 * - Ensure audio duration matches exact narration timing
 * - Create OpenCut-compatible audio element
 * - Return complete track ready for timeline
 */
export class VoiceTrackBuilder {
  /**
   * Build a complete voice track from audio asset
   */
  async buildVoiceTrack(audioAsset: AudioAsset): Promise<{
    track: OpenCutTrack;
    mediaAsset: OpenCutMediaAsset;
  }> {
    // Validate audio asset
    this.validateAudioAsset(audioAsset);

    // Convert to OpenCut media asset
    const mediaAsset = this.toOpenCutMediaAsset(audioAsset);

    // Ensure waveform data exists (generate if needed)
    const waveformData = audioAsset.waveformData || (await this.generateWaveform(audioAsset));

    // Create audio element
    const audioElement = this.createAudioElement(audioAsset, waveformData);

    // Create track
    const track: OpenCutTrack = {
      id: "voiceover",
      name: "Voiceover",
      type: "audio",
      elements: [audioElement],
      muted: false,
      hidden: false,
    };

    return { track, mediaAsset };
  }

  /**
   * Validate audio asset has required fields
   */
  private validateAudioAsset(audioAsset: AudioAsset): void {
    if (!audioAsset.id) {
      throw new Error("AudioAsset must have an id");
    }
    if (!audioAsset.r2Url) {
      throw new Error("AudioAsset must have an r2Url");
    }
    if (audioAsset.durationMs <= 0) {
      throw new Error("AudioAsset duration must be greater than 0");
    }
  }

  /**
   * Convert to OpenCut media asset format
   */
  private toOpenCutMediaAsset(audioAsset: AudioAsset): OpenCutMediaAsset {
    return {
      id: audioAsset.id,
      name: `voiceover-${audioAsset.voiceType || "default"}`,
      type: "audio",
      url: audioAsset.r2Url,
      durationMs: audioAsset.durationMs,
    };
  }

  /**
   * Create audio element with waveform
   */
  private createAudioElement(audioAsset: AudioAsset, waveformData: number[] | null): OpenCutAudioElement {
    return {
      id: `audio-element-${audioAsset.id}`,
      name: "Narration",
      type: "audio",
      mediaId: audioAsset.id,
      startTime: 0, // Always start at timeline beginning
      duration: audioAsset.durationMs,
      trimStart: 0,
      trimEnd: audioAsset.durationMs,
      params: {
        volume: 1.0,
        pan: 0,
      },
      waveform: waveformData,
    };
  }

  /**
   * Generate waveform data from audio asset
   *
   * This is a placeholder implementation.
   * In production, you would:
   * 1. Fetch audio from R2 URL
   * 2. Decode audio buffer (Web Audio API)
   * 3. Extract PCM samples
   * 4. Normalize to visualization-friendly format
   * 5. Sample down to ~1000-2000 data points
   *
   * For now, we return the existing waveform or null.
   */
  private async generateWaveform(audioAsset: AudioAsset): Promise<number[] | null> {
    // If waveform already exists, use it
    if (audioAsset.waveformData) {
      return audioAsset.waveformData;
    }

    // TODO: Implement actual waveform generation
    // This would involve:
    // - Fetching audio from R2
    // - Using Web Audio API to decode
    // - Extracting waveform peaks
    // - Normalizing to [-1, 1] range
    // - Returning as number[]

    console.warn("Waveform generation not yet implemented. Using placeholder.");
    return null;
  }
}

/**
 * Create and export singleton instance
 */
export const voiceTrackBuilder = new VoiceTrackBuilder();
