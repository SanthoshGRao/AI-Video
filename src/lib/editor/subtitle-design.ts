import { generateId } from "@designcombo/timeline";
import type { IDesign, ITrack, ITrackItem } from "@designcombo/types";
import type { SubtitleCue, SubtitleStyle } from "@/lib/subtitles/types";
import {
  buildMasterCaptionItem,
  projectAssetsToDesign,
} from "@/lib/editor/designcombo-adapter";
import type { LoadedProjectAssets } from "@/lib/editor/types";

/** Rebuild caption track items from API cues while keeping other layers. */
export function mergeSubtitlesIntoDesign(
  design: IDesign,
  cues: SubtitleCue[],
  style: SubtitleStyle,
  canvasW: number,
  canvasH: number
): IDesign {
  const captionIds = new Set<string>();
  const nextMap: Record<string, ITrackItem> = {};
  const nextIds: string[] = [];

  for (const id of design.trackItemIds) {
    const item = design.trackItemsMap[id];
    if (!item) continue;
    if (item.type === "caption") {
      captionIds.add(id);
      continue;
    }
    nextMap[id] = item;
    nextIds.push(id);
  }

  const newCaptionIds: string[] = [];
  const masterCaption = buildMasterCaptionItem(cues, style, canvasW, canvasH);
  if (masterCaption) {
    nextMap[masterCaption.id] = masterCaption;
    newCaptionIds.push(masterCaption.id);
  }

  const tracks = design.tracks
    .filter((t) => t.type !== "caption")
    .concat(
      newCaptionIds.length
        ? [
            {
              id: generateId(),
              type: "caption" as ITrack["type"],
              items: newCaptionIds,
              muted: false,
              accepts: ["caption", "text"],
              magnetic: false,
              static: false,
            },
          ]
        : []
    );

  return {
    ...design,
    tracks,
    trackItemsMap: nextMap,
    trackItemIds: [...nextIds, ...newCaptionIds],
  };
}

export function designFromLoadedWithSubtitles(loaded: LoadedProjectAssets, projectId: string) {
  return projectAssetsToDesign({
    projectId,
    loaded,
    aspect: loaded.timeline?.settings
      ? {
          width: loaded.timeline.settings.width,
          height: loaded.timeline.settings.height,
        }
      : undefined,
  });
}
