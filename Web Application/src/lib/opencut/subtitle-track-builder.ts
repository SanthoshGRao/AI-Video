import type { SubtitleCue, SubtitleStyle, SubtitleTrackData } from "@/types";
import type { OpenCutTextElement, OpenCutTrack } from "@/opencut/types";

/**
 * SubtitleTrackBuilder
 *
 * Automatically creates text tracks for subtitles.
 *
 * Responsibilities:
 * - Convert subtitle cues to OpenCut text elements
 * - Preserve word-level timing information
 * - Preserve sentence-level timing
 * - Apply subtitle styles consistently
 * - Ensure all text is editable in OpenCut
 * - Position subtitles correctly on canvas
 * - Return complete track ready for timeline
 */
export class SubtitleTrackBuilder {
  /**
   * Build a complete subtitle track from subtitle data
   */
  async buildSubtitleTrack(subtitles: SubtitleTrackData): Promise<{
    track: OpenCutTrack;
    styleConfig: SubtitleStyle | null;
  }> {
    // Validate subtitle data
    this.validateSubtitleData(subtitles);

    // Create text elements from cues
    const textElements = this.createTextElements(subtitles.cues, subtitles.customStyle);

    // Apply styling to all elements
    const styledElements = this.applySubtitleStyling(textElements, subtitles.customStyle);

    // Create track
    const track: OpenCutTrack = {
      id: "subtitles",
      name: "Subtitles",
      type: "text",
      elements: styledElements,
      muted: false,
      hidden: false,
    };

    return { track, styleConfig: subtitles.customStyle };
  }

  /**
   * Validate subtitle data
   */
  private validateSubtitleData(subtitles: SubtitleTrackData): void {
    if (!subtitles.id) {
      throw new Error("SubtitleTrackData must have an id");
    }
    if (!Array.isArray(subtitles.cues) || subtitles.cues.length === 0) {
      throw new Error("SubtitleTrackData must have at least one cue");
    }
  }

  /**
   * Create text elements from subtitle cues
   *
   * Each cue becomes a text element with:
   * - Exact start/end timing from cue
   * - Full cue text
   * - Word-level timing preserved (for animations/effects)
   * - Role: "subtitle" for styling purposes
   */
  private createTextElements(
    cues: SubtitleCue[],
    style: SubtitleStyle | null
  ): OpenCutTextElement[] {
    return cues.map((cue) => {
      // Calculate duration
      const duration = cue.endMs - cue.startMs;

      // Create element
      const element: OpenCutTextElement = {
        id: cue.id,
        name: `Subtitle ${cue.id}`,
        type: "text",
        role: "subtitle",
        text: cue.text,
        cueId: cue.id,
        startTime: cue.startMs,
        duration: Math.max(duration, 100), // Ensure minimum duration
        trimStart: 0,
        trimEnd: duration,
        params: this.buildSubtitleParams(style),
        // Preserve word-level timing for animations
        words: cue.words?.map((w) => ({
          word: w.word,
          startMs: w.startMs - cue.startMs, // Relative to element start
          endMs: w.endMs - cue.startMs,
        })),
      };

      return element;
    });
  }

  /**
   * Build subtitle params from style
   */
  private buildSubtitleParams(style: SubtitleStyle | null): Record<string, unknown> {
    if (!style) {
      return {
        position: "center",
        fontSize: 24,
        fontFamily: "Arial",
        color: "white",
      };
    }

    return {
      fontFamily: style.fontFamily || "Arial",
      fontSize: style.fontSize || 24,
      fontWeight: style.fontWeight || 400,
      color: style.color || "white",
      backgroundColor: style.backgroundColor || "transparent",
      position: style.position || "center",
      animation: style.animation || "none",
      highlightColor: style.highlightColor,
      stroke: style.stroke,
      strokeColor: style.strokeColor,
      strokeWidth: style.strokeWidth,
      shadow: style.shadow,
    };
  }

  /**
   * Apply subtitle styling to text elements
   *
   * This ensures:
   * - Consistent appearance across all subtitles
   * - Proper positioning on canvas
   * - All styling properties are editable
   * - Animations are preserved for preview
   */
  private applySubtitleStyling(
    elements: OpenCutTextElement[],
    style: SubtitleStyle | null
  ): OpenCutTextElement[] {
    return elements.map((element) => {
      // Add position information if using center position
      const positionX = 0.5; // 50% - center horizontal
      const positionY = style?.position === "top" ? 0.1 : style?.position === "bottom" ? 0.9 : 0.8;

      return {
        ...element,
        params: {
          ...element.params,
          positionX,
          positionY,
          width: 900,
          textAlign: "center",
          // Ensure element is editable
          editable: true,
          selectable: true,
        },
      };
    });
  }

  /**
   * Build subtitle track for word-level animation
   *
   * If animation type is "karaoke" or "highlight", we keep word timing.
   * Otherwise, we can simplify but still preserve for potential future use.
   */
  buildWordLevelAnimationTrack(
    cues: SubtitleCue[],
    animationType: "karaoke" | "highlight" | "word_pop" | "fade" | "none" = "none"
  ): OpenCutTextElement[] {
    if (animationType === "none") {
      return this.createTextElements(cues, null);
    }

    return cues.map((cue) => {
      const duration = cue.endMs - cue.startMs;

      return {
        id: cue.id,
        name: `Subtitle ${cue.id}`,
        type: "text",
        role: "subtitle",
        text: cue.text,
        cueId: cue.id,
        startTime: cue.startMs,
        duration: Math.max(duration, 100),
        trimStart: 0,
        trimEnd: duration,
        params: {
          animation: animationType,
          fontSize: 24,
          color: "white",
          position: "center",
          // Animation-specific params
          ...(animationType === "karaoke" && {
            karaokeFillColor: "#FF6B00",
            karaokeOutlineColor: "white",
          }),
          ...(animationType === "highlight" && {
            highlightColor: "#FFD700",
          }),
        },
        // Always preserve word timing for animation calculations
        words: cue.words?.map((w) => ({
          word: w.word,
          startMs: w.startMs - cue.startMs,
          endMs: w.endMs - cue.startMs,
        })),
      } as OpenCutTextElement;
    });
  }
}

/**
 * Create and export singleton instance
 */
export const subtitleTrackBuilder = new SubtitleTrackBuilder();
