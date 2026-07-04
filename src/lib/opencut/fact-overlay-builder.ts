import type { ExtractedFacts, SubtitleCue } from "@/types";
import type { OpenCutTextElement, OpenCutTrack } from "@/opencut/types";

/**
 * FactTiming - represents when a fact should appear on screen
 */
export interface FactTiming {
  factText: string;
  startMs: number;
  endMs: number;
  category?: string; // location, price, size, etc.
}

/**
 * FactOverlayBuilder
 *
 * Automatically creates text overlays for extracted property facts.
 *
 * Responsibilities:
 * - Map extracted facts to mention points in narration
 * - Determine timing based on audio sync data
 * - Create text elements with precise start/end times
 * - Style fact overlays appropriately
 * - Position overlays on canvas (configurable)
 * - Format fact text for display
 * - Return complete track ready for timeline
 *
 * Example Facts:
 * - 22 Acre Land
 * - Near Mysore
 * - ₹65 Lakhs Per Acre
 * - RTC Property
 * - 30 Feet Road
 * - 1 Borewell
 * - 42 Coconut Trees
 */
export class FactOverlayBuilder {
  /**
   * Build a complete fact overlay track
   */
  async buildFactTrack(
    facts: ExtractedFacts | null,
    cues: SubtitleCue[] | null
  ): Promise<{
    track: OpenCutTrack | null;
    factElements: OpenCutTextElement[];
  }> {
    // Validate inputs
    if (!facts) {
      return { track: null, factElements: [] };
    }

    if (!cues || cues.length === 0) {
      return { track: null, factElements: [] };
    }

    // Extract fact mentions with timings
    const factTimings = this.extractFactTimings(facts, cues);

    if (factTimings.length === 0) {
      return { track: null, factElements: [] };
    }

    // Create text elements
    const textElements = this.createFactTextElements(factTimings);

    // Create track
    const track: OpenCutTrack = {
      id: "facts",
      name: "Fact Overlays",
      type: "text",
      elements: textElements,
      muted: false,
      hidden: false,
    };

    return { track, factElements: textElements };
  }

  /**
   * Extract fact mention timings from subtitle cues
   */
  private extractFactTimings(
    facts: ExtractedFacts,
    cues: SubtitleCue[]
  ): FactTiming[] {
    const timings: FactTiming[] = [];

    // Helper to find word position in cues and get timing
    const findFactTiming = (factKeywords: string[]): FactTiming | null => {
      for (const keyword of factKeywords) {
        const lowerKeyword = keyword.toLowerCase();

        // Search through all cues to find the keyword
        for (const cue of cues) {
          const lowerCueText = cue.text.toLowerCase();
          const keywordIndex = lowerCueText.indexOf(lowerKeyword);
          
          if (keywordIndex !== -1) {
            // Found it in this cue!
            // Let's use word timings if available, otherwise fallback to cue timing
            if (cue.words && cue.words.length > 0) {
               // Find the words that match this keyword in the cue
               let startWord = cue.words[0];
               let endWord = cue.words[cue.words.length - 1];
               
               let charCount = 0;
               for (const word of cue.words) {
                 if (charCount >= keywordIndex && startWord === cue.words[0]) {
                   startWord = word;
                 }
                 if (charCount >= keywordIndex + keyword.length) {
                   break;
                 }
                 endWord = word;
                 charCount += word.word.length + 1; // +1 for space
               }
               
               return {
                 factText: keyword,
                 startMs: startWord.startMs,
                 endMs: endWord.endMs,
                 category: this.categorizeFact(keyword),
               };
            }
            
            // Fallback to cue timing
            return {
              factText: keyword,
              startMs: cue.startMs,
              endMs: cue.endMs,
              category: this.categorizeFact(keyword),
            };
          }
        }
      }

      return null;
    };

    // Build fact text options and find timings
    const factDefinitions = this.buildFactDefinitions(facts);

    for (const factDef of factDefinitions) {
      const timing = findFactTiming(factDef.keywords);
      if (timing) {
        timings.push(timing);
      }
    }

    return timings;
  }

  /**
   * Build fact definitions with display text and keywords
   */
  private buildFactDefinitions(facts: ExtractedFacts): Array<{ text: string; keywords: string[] }> {
    const definitions: Array<{ text: string; keywords: string[] }> = [];

    // Location
    if (facts.location) {
      definitions.push({
        text: facts.location,
        keywords: [facts.location, facts.location.split(",")[0]],
      });
    }

    // Price
    if (facts.price) {
      const priceText = `${facts.price} ${facts.priceUnit || "per acre"}`;
      definitions.push({
        text: priceText,
        keywords: [facts.price, `${facts.price} ${facts.priceUnit}`],
      });
    }

    // Plot Size
    if (facts.plotSize) {
      definitions.push({
        text: `${facts.plotSize} acres`,
        keywords: [facts.plotSize, `${facts.plotSize} acre`],
      });
    }

    // Property Type
    if (facts.propertyType) {
      definitions.push({
        text: facts.propertyType,
        keywords: [facts.propertyType],
      });
    }

    // Legal Status
    if (facts.legal && facts.legal.length > 0) {
      const legalText = facts.legal.join(", ");
      definitions.push({
        text: legalText,
        keywords: facts.legal,
      });
    }

    // Road Access
    if (facts.roadAccess) {
      definitions.push({
        text: facts.roadAccess,
        keywords: [facts.roadAccess],
      });
    }

    // Water
    if (facts.water && facts.water.length > 0) {
      const waterText = facts.water.join(", ");
      definitions.push({
        text: waterText,
        keywords: facts.water,
      });
    }

    // Plantation
    if (facts.plantation && facts.plantation.length > 0) {
      for (const plant of facts.plantation) {
        definitions.push({
          text: `${plant.count} ${plant.type}`,
          keywords: [plant.type, `${plant.count} ${plant.type}`],
        });
      }
    }

    // Nearby Landmarks
    if (facts.nearbyLandmarks && facts.nearbyLandmarks.length > 0) {
      for (const landmark of facts.nearbyLandmarks) {
        definitions.push({
          text: `Near ${landmark}`,
          keywords: [landmark],
        });
      }
    }

    return definitions;
  }

  /**
   * Create text elements from fact timings
   */
  private createFactTextElements(factTimings: FactTiming[]): OpenCutTextElement[] {
    return factTimings.map((timing, index) => {
      const duration = Math.max(timing.endMs - timing.startMs, 500); // Min 500ms visibility

      return {
        id: `fact-${index}-${Math.random().toString(36).slice(2, 7)}`,
        name: `Fact: ${timing.factText}`,
        type: "text",
        role: "fact",
        text: timing.factText,
        startTime: timing.startMs,
        duration,
        trimStart: 0,
        trimEnd: duration,
        params: this.buildFactParams(timing.category),
      } as OpenCutTextElement;
    });
  }

  /**
   * Build params for fact overlay
   *
   * Positioning:
   * - Facts appear as overlays on top-right or bottom-right
   * - Multiple facts cascade down
   * - Each fact is visible for ~3-5 seconds or until mention ends
   */
  private buildFactParams(category?: string): Record<string, unknown> {
    const baseFontSize = 20;
    const fontSizeByCategory: Record<string, number> = {
      price: 28, // Price is most important
      location: 24,
      size: 22,
      default: 20,
    };

    return {
      fontFamily: "Arial",
      fontSize: fontSizeByCategory[category || "default"] || baseFontSize,
      fontWeight: 600,
      color: "white",
      backgroundColor: "rgba(0, 0, 0, 0.7)", // Dark semi-transparent background
      position: "top-right", // Custom position for overlays
      positionX: 0.85, // 85% from left
      positionY: 0.15, // 15% from top (but will cascade)
      padding: 12,
      borderRadius: 4,
      animation: "fade",
      animationDuration: 200,
      editable: true,
      selectable: true,
      category,
    };
  }

  /**
   * Categorize fact for styling purposes
   */
  private categorizeFact(factText: string): string {
    const text = factText.toLowerCase();

    if (text.includes("₹") || text.includes("price") || text.includes("lakh")) {
      return "price";
    }
    if (text.includes("acre") || text.includes("size")) {
      return "size";
    }
    if (text.includes("near") || text.includes("location")) {
      return "location";
    }
    if (text.includes("road") || text.includes("access")) {
      return "access";
    }

    return "default";
  }
}

/**
 * Create and export singleton instance
 */
export const factOverlayBuilder = new FactOverlayBuilder();
