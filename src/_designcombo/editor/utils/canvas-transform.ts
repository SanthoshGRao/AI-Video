import type StateManager from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";

export function parsePx(value: string | number | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number.parseFloat(String(value).replace("px", "")) || 0;
}

export function isItemLocked(item: ITrackItem | undefined): boolean {
  return Boolean(item?.metadata?.locked);
}

export function getElementRect(
  target: HTMLElement,
  canvasW: number,
  canvasH: number
) {
  const left = parsePx(target.style.left);
  const top = parsePx(target.style.top);
  const width = target.offsetWidth;
  const height = target.offsetHeight;
  return { left, top, width, height, canvasW, canvasH };
}

/** Center selected element on the artboard. */
export function centerElementOnCanvas(
  id: string,
  target: HTMLElement,
  canvasW: number,
  canvasH: number
) {
  const { width, height } = getElementRect(target, canvasW, canvasH);
  const left = Math.round((canvasW - width) / 2);
  const top = Math.round((canvasH - height) / 2);
  target.style.left = `${left}px`;
  target.style.top = `${top}px`;
  dispatch(EDIT_OBJECT, {
    payload: {
      [id]: {
        details: {
          left: `${left}px`,
          top: `${top}px`,
        },
      },
    },
  });
}

/** Nudge element position by delta pixels. */
export function nudgeElement(
  id: string,
  target: HTMLElement,
  dx: number,
  dy: number
) {
  const left = parsePx(target.style.left) + dx;
  const top = parsePx(target.style.top) + dy;
  target.style.left = `${left}px`;
  target.style.top = `${top}px`;
  dispatch(EDIT_OBJECT, {
    payload: {
      [id]: {
        details: {
          left: `${left}px`,
          top: `${top}px`,
        },
      },
    },
  });
}

export function setItemsLocked(
  ids: string[],
  locked: boolean,
  trackItemsMap: Record<string, ITrackItem>
) {
  const payload: Record<string, { metadata: Record<string, unknown> }> = {};
  for (const id of ids) {
    const item = trackItemsMap[id];
    if (!item) continue;
    payload[id] = {
      metadata: { ...(item.metadata ?? {}), locked },
    };
  }
  dispatch(EDIT_OBJECT, { payload });
}

export function reorderTrackItem(
  stateManager: StateManager,
  id: string,
  direction: "forward" | "backward"
) {
  const state = stateManager.getState();
  const ids = [...state.trackItemIds];
  const index = ids.indexOf(id);
  if (index === -1) return;

  const swapIndex = direction === "forward" ? index + 1 : index - 1;
  if (swapIndex < 0 || swapIndex >= ids.length) return;

  [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];

  const tracks = state.tracks.map((track) => {
    const items = [...track.items];
    const ti = items.indexOf(id);
    if (ti === -1) return track;
    const swapTi = direction === "forward" ? ti + 1 : ti - 1;
    if (swapTi < 0 || swapTi >= items.length) return track;
    [items[ti], items[swapTi]] = [items[swapTi], items[ti]];
    return { ...track, items };
  });

  stateManager.updateState(
    { trackItemIds: ids, tracks },
    { updateHistory: true, kind: "update" }
  );
}
