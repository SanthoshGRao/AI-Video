import { ASPECTS, type AspectId } from "./editor-data";
import type { StageElement } from "./editor-store";

/** Fit media on stage preserving native aspect ratio (contain, centered). */
export function computeMediaStageRect(
  mediaW: number,
  mediaH: number,
  stageAspectW: number,
  stageAspectH: number,
  maxFill = 0.88,
): Pick<StageElement, "x" | "y" | "w" | "h"> {
  if (mediaW <= 0 || mediaH <= 0) {
    return { x: 8, y: 8, w: 84, h: 84 };
  }

  const mediaAspect = mediaW / mediaH;
  const stageAspect = stageAspectW / stageAspectH;

  // Media's native aspect ratio matches the canvas orientation closely
  // enough (e.g. a 9:16 video dropped onto a 9:16 stage) — fill the stage
  // completely (all edges/vertices) instead of leaving an inset margin.
  if (Math.abs(mediaAspect - stageAspect) / stageAspect < 0.02) {
    return { x: 0, y: 0, w: 100, h: 100 };
  }

  let wPct: number;
  let hPct: number;

  if (mediaAspect >= stageAspect) {
    wPct = maxFill * 100;
    hPct = wPct * (stageAspect / mediaAspect);
  } else {
    hPct = maxFill * 100;
    wPct = hPct * (mediaAspect / stageAspect);
  }

  return {
    x: (100 - wPct) / 2,
    y: (100 - hPct) / 2,
    w: wPct,
    h: hPct,
  };
}

export function probeMediaDimensions(
  src: string,
  kind: "image" | "video",
): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    if (kind === "image") {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = src;
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      resolve({ w: video.videoWidth || 16, h: video.videoHeight || 9 });
    video.onerror = () => resolve({ w: 16, h: 9 });
    video.src = src;
  });
}

export async function fitElementToMediaAspect(
  elementId: string,
  src: string,
  kind: "image" | "video",
  aspectId: AspectId,
  updateElement: (id: string, patch: Partial<StageElement>) => void,
): Promise<void> {
  const dims = await probeMediaDimensions(src, kind);
  const aspect = ASPECTS.find((a) => a.id === aspectId) ?? ASPECTS[0];
  const rect = computeMediaStageRect(dims.w, dims.h, aspect.w, aspect.h);
  const isFullBleed = rect.x === 0 && rect.y === 0 && rect.w === 100 && rect.h === 100;
  // Full-bleed (matching aspect) uses "cover" so any sub-pixel aspect
  // mismatch still crops to fill rather than leaving hairline gaps.
  updateElement(elementId, { ...rect, fit: isFullBleed ? "cover" : "contain" });
}
