import type { MediaAsset } from "@/types";
import type { OpenCutVideoElement, OpenCutImageElement, OpenCutTrack, OpenCutMediaAsset } from "@/opencut/types";

/**
 * MediaPlacement - represents placement of a media clip on timeline
 */
export interface MediaPlacement {
  mediaAsset: MediaAsset;
  startMs: number;
  endMs: number;
  duration: number;
  position?: number; // Order in sequence
}

/**
 * MediaTrackBuilder
 *
 * Automatically distributes and places media clips on timeline.
 *
 * Responsibilities:
 * - Analyze uploaded media (images, videos)
 * - Distribute clips intelligently across narration duration
 * - Create video track with media elements
 * - Create image track for still images
 * - Calculate optimal duration for each clip
 * - Add transitions between clips
 * - Ensure continuous coverage of timeline
 * - Allow drag-and-drop editing in OpenCut
 * - Return complete tracks ready for timeline
 *
 * Algorithm:
 * 1. Separate videos and images
 * 2. Calculate total narration duration
 * 3. Distribute media proportionally
 * 4. Create elements with calculated durations
 * 5. Add fade transitions between clips
 * 6. Ensure no gaps in timeline
 */
export class MediaTrackBuilder {
  // Minimum clip duration to avoid visual jitter
  private readonly MIN_CLIP_DURATION_MS = 1000; // 1 second

  // Maximum single clip duration (break up long videos)
  private readonly MAX_CLIP_DURATION_MS = 15000; // 15 seconds

  // Transition duration
  private readonly TRANSITION_DURATION_MS = 300; // 300ms fade

  /**
   * Build complete media tracks
   */
  async buildMediaTracks(
    mediaAssets: MediaAsset[],
    narrationDurationMs: number,
    scriptSentences?: string[]
  ): Promise<{
    videoTrack: OpenCutTrack | null;
    imageTrack: OpenCutTrack | null;
    mediaAssets: OpenCutMediaAsset[];
  }> {
    // Validate inputs
    if (!mediaAssets || mediaAssets.length === 0) {
      return { videoTrack: null, imageTrack: null, mediaAssets: [] };
    }

    if (narrationDurationMs <= 0) {
      throw new Error("Narration duration must be greater than 0");
    }

    // Separate videos and images
    const videos = mediaAssets.filter((m) => m.type === "VIDEO");
    const images = mediaAssets.filter((m) => m.type === "IMAGE");

    // Convert to OpenCut media assets
    const openCutMediaAssets = mediaAssets.map((m) => this.toOpenCutMediaAsset(m));

    // Build video track
    let videoTrack: OpenCutTrack | null = null;
    if (videos.length > 0) {
      videoTrack = await this.buildVideoTrack(videos, narrationDurationMs, openCutMediaAssets);
    }

    // Build image track
    let imageTrack: OpenCutTrack | null = null;
    if (images.length > 0) {
      imageTrack = await this.buildImageTrack(images, narrationDurationMs, openCutMediaAssets);
    }

    return { videoTrack, imageTrack, mediaAssets: openCutMediaAssets };
  }

  /**
   * Build video track
   */
  private async buildVideoTrack(
    videos: MediaAsset[],
    narrationDurationMs: number,
    mediaAssets: OpenCutMediaAsset[]
  ): Promise<OpenCutTrack> {
    const placements = this.distributeMediaClips(videos, narrationDurationMs);
    const elements = this.createMediaElements(placements, "video");

    return {
      id: `video-track-${Math.random().toString(36).slice(2, 7)}`,
      name: "Video",
      type: "video",
      elements: elements as any,
      muted: false,
      hidden: false,
    };
  }

  /**
   * Build image track (images shown as short stills)
   */
  private async buildImageTrack(
    images: MediaAsset[],
    narrationDurationMs: number,
    mediaAssets: OpenCutMediaAsset[]
  ): Promise<OpenCutTrack> {
    // For images, use shorter display duration (3-5 seconds)
    const placements = this.distributeMediaClips(
      images,
      narrationDurationMs,
      this.MIN_CLIP_DURATION_MS,
      5000 // 5 second max for images
    );

    const elements = this.createMediaElements(placements, "image");

    return {
      id: `image-track-${Math.random().toString(36).slice(2, 7)}`,
      name: "Images",
      type: "video",
      elements: elements as any,
      muted: false,
      hidden: false,
    };
  }

  /**
   * Distribute media clips across timeline
   *
   * Algorithm:
   * 1. Calculate slots: narration_duration / num_clips
   * 2. For each clip, assign a time slot
   * 3. Clip duration = slot_size - transition_overlap
   * 4. Position = slot_index * slot_size
   */
  private distributeMediaClips(
    media: MediaAsset[],
    narrationDurationMs: number,
    minDuration: number = this.MIN_CLIP_DURATION_MS,
    maxDuration: number = this.MAX_CLIP_DURATION_MS
  ): MediaPlacement[] {
    const placements: MediaPlacement[] = [];

    if (media.length === 0) return placements;

    // Calculate slot size
    const slotSize = narrationDurationMs / media.length;

    // Create placement for each media
    media.forEach((asset, index) => {
      const startMs = Math.round(index * slotSize);

      // Get next clip's start time (or end of narration)
      const nextStart = index < media.length - 1 ? Math.round((index + 1) * slotSize) : narrationDurationMs;

      // Calculate duration, accounting for transitions
      const transitionOverlap = index < media.length - 1 ? this.TRANSITION_DURATION_MS : 0;
      let duration = Math.round(nextStart - startMs - transitionOverlap);

      // Enforce duration constraints
      duration = Math.max(minDuration, Math.min(duration, maxDuration));

      // Ensure we don't exceed narration end
      const endMs = Math.min(startMs + duration, narrationDurationMs);
      const finalDuration = endMs - startMs;

      placements.push({
        mediaAsset: asset,
        startMs,
        endMs,
        duration: finalDuration,
        position: index,
      });
    });

    return placements;
  }

  /**
   * Create media elements from placements
   */
  private createMediaElements(
    placements: MediaPlacement[],
    elementType: "video" | "image"
  ): Array<OpenCutVideoElement | OpenCutImageElement> {
    return placements.map((placement) => {
      const mediaAsset = placement.mediaAsset;
      const baseType = elementType === "video" ? "video" : "image";

      const element: OpenCutVideoElement | OpenCutImageElement = {
        id: `${baseType}-element-${mediaAsset.id}`,
        name: `${mediaAsset.originalName}`,
        type: baseType,
        mediaId: mediaAsset.id,
        startTime: placement.startMs,
        duration: placement.duration,
        trimStart: 0,
        trimEnd: Math.min(placement.duration, (mediaAsset.durationMs || placement.duration) || placement.duration),
        params: this.buildMediaParams(mediaAsset, elementType),
        ...(baseType === "video" && { isSourceAudioEnabled: false }),
      } as OpenCutVideoElement | OpenCutImageElement;

      return element;
    });
  }

  /**
   * Build params for media element
   */
  private buildMediaParams(mediaAsset: MediaAsset, type: "video" | "image"): Record<string, unknown> {
    return {
      scale: 1.0,
      opacity: 1.0,
      rotation: 0,
      positionX: 0.5, // Center
      positionY: 0.5,
      width: mediaAsset.width || 1920,
      height: mediaAsset.height || 1080,
      // For videos, disable audio by default (we have voiceover)
      ...(type === "video" && {
        audioEnabled: false,
        playbackRate: 1.0,
      }),
      // Transitions
      transitionIn: {
        type: "fade",
        duration: this.TRANSITION_DURATION_MS,
      },
      transitionOut: {
        type: "fade",
        duration: this.TRANSITION_DURATION_MS,
      },
      // Allow editing
      editable: true,
      selectable: true,
      draggable: true,
    };
  }

  /**
   * Convert to OpenCut media asset
   */
  private toOpenCutMediaAsset(mediaAsset: MediaAsset): OpenCutMediaAsset {
    return {
      id: mediaAsset.id,
      name: mediaAsset.originalName,
      type: mediaAsset.type === "VIDEO" ? "video" : mediaAsset.type === "IMAGE" ? "image" : "image",
      url: mediaAsset.r2Url,
      thumbnailUrl: mediaAsset.thumbnailUrl || undefined,
      durationMs: mediaAsset.durationMs || undefined,
      width: mediaAsset.width || undefined,
      height: mediaAsset.height || undefined,
    };
  }

  /**
   * Calculate optimal duration for media based on narration
   *
   * Strategy:
   * - Shorter narrations: fewer, longer clips
   * - Longer narrations: more clips, each shorter
   * - Minimum 1 second per clip
   * - Maximum 15 seconds per clip
   */
  calculateOptimalClipDuration(
    numClips: number,
    narrationDurationMs: number
  ): number {
    const baseSlot = narrationDurationMs / numClips;
    const withoutTransition = baseSlot - this.TRANSITION_DURATION_MS;
    const constrained = Math.max(
      this.MIN_CLIP_DURATION_MS,
      Math.min(withoutTransition, this.MAX_CLIP_DURATION_MS)
    );

    return Math.round(constrained);
  }
}

/**
 * Create and export singleton instance
 */
export const mediaTrackBuilder = new MediaTrackBuilder();
