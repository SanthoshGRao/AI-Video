import { generateId } from "@designcombo/timeline";
import type { IAudio, IImage, IVideo } from "@designcombo/types";

export function buildVideoDragPayload(src: string, previewUrl?: string): Partial<IVideo> {
  return {
    id: generateId(),
    type: "video",
    details: { src } as IVideo["details"],
    metadata: { previewUrl: previewUrl ?? src },
  };
}

export function buildImageDragPayload(src: string): Partial<IImage> {
  return {
    id: generateId(),
    type: "image",
    display: { from: 0, to: 5000 },
    details: { src } as IImage["details"],
    metadata: {},
  };
}

export function buildAudioDragPayload(src: string, name?: string): Partial<IAudio> {
  return {
    id: generateId(),
    type: "audio",
    details: { src },
    metadata: { author: name ?? "Audio" },
  };
}
