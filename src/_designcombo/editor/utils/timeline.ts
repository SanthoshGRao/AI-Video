import { ITimelineScaleState } from "@designcombo/types";
import { TIMELINE_ZOOM_LEVELS } from "../constants/scale";
import { timeMsToUnits as libTimeMsToUnits, unitsToTimeMs as libUnitsToTimeMs } from "@designcombo/timeline";

export function getPreviousZoomLevel(
  currentZoom: ITimelineScaleState
): ITimelineScaleState {
  const previousZoom = getPreviousZoom(currentZoom);
  return previousZoom || TIMELINE_ZOOM_LEVELS[0];
}

export function getZoomByIndex(index: number) {
  return TIMELINE_ZOOM_LEVELS[index];
}

export function getNextZoomLevel(
  currentZoom: ITimelineScaleState
): ITimelineScaleState {
  const nextZoom = getNextZoom(currentZoom);
  return nextZoom || TIMELINE_ZOOM_LEVELS[TIMELINE_ZOOM_LEVELS.length - 1];
}

export const getPreviousZoom = (
  currentZoom: ITimelineScaleState
): ITimelineScaleState | null => {
  const smallerZoomLevels = TIMELINE_ZOOM_LEVELS.filter(
    (level) => level.zoom < currentZoom.zoom
  );
  if (smallerZoomLevels.length === 0) return null;
  return smallerZoomLevels.reduce((prev, curr) =>
    curr.zoom > prev.zoom ? curr : prev
  );
};

export const getNextZoom = (
  currentZoom: ITimelineScaleState
): ITimelineScaleState | null => {
  const largerZoomLevels = TIMELINE_ZOOM_LEVELS.filter(
    (level) => level.zoom > currentZoom.zoom
  );
  if (largerZoomLevels.length === 0) return null;
  return largerZoomLevels.reduce((prev, curr) =>
    curr.zoom < prev.zoom ? curr : prev
  );
};

export function getFitZoomLevel(
  totalLengthMs: number,
  zoom = 1,
  scrollOffset = 8
): ITimelineScaleState {
  const getVisibleWidth = () => {
    const clampedScrollOffset = Math.max(0, scrollOffset);
    const timelineCanvas = document.getElementById(
      "designcombo-timeline-canvas"
    ) as HTMLElement;
    const offsetWidth =
      timelineCanvas?.offsetWidth ?? document.body.offsetWidth;
    return Math.max(1, offsetWidth - clampedScrollOffset);
  };

  const getFullWidth = () => {
    if (typeof totalLengthMs === "number") {
      return timeMsToUnits(totalLengthMs, zoom);
    }
    return calculateTimelineWidth(totalLengthMs, zoom);
  };

  const multiplier = getVisibleWidth() / getFullWidth();
  const targetZoom = zoom * multiplier;
  const clampedTargetZoom = Math.max(
    TIMELINE_ZOOM_LEVELS[0].zoom,
    Math.min(targetZoom, TIMELINE_ZOOM_LEVELS[TIMELINE_ZOOM_LEVELS.length - 1].zoom)
  );

  const closest = TIMELINE_ZOOM_LEVELS.reduce((best, level) => {
    const bestDistance = Math.abs(best.zoom - clampedTargetZoom);
    const levelDistance = Math.abs(level.zoom - clampedTargetZoom);
    return levelDistance < bestDistance ? level : best;
  }, TIMELINE_ZOOM_LEVELS[0]);

  return closest;
}

/**
 * Convert milliseconds to timeline pixel units using the actual store FPS.
 * Delegates to @designcombo/timeline library for consistency with canvas rendering.
 */
export function timeMsToUnits(timeMs: number, zoom = 1): number {
  return libTimeMsToUnits(timeMs, zoom);
}

/**
 * Convert timeline pixel units to milliseconds using the actual store FPS.
 * Delegates to @designcombo/timeline library for consistency with canvas rendering.
 */
export function unitsToTimeMs(units: number, zoom = 1): number {
  return libUnitsToTimeMs(units, zoom);
}

export function calculateTimelineWidth(
  totalLengthMs: number,
  zoom = 1
): number {
  return timeMsToUnits(totalLengthMs, zoom);
}
