import { dispatch } from "@designcombo/events";
import {
  EDIT_OBJECT,
  LAYER_CLONE,
  LAYER_DELETE,
} from "@designcombo/state";
import type StateManager from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { reorderTrackItem } from "./canvas-transform";
import useStore from "../store/use-store";

export type LayerGroupKey = "video" | "image" | "text" | "caption" | "audio";

export const LAYER_GROUP_LABELS: Record<LayerGroupKey, string> = {
  video: "Video",
  image: "Image",
  text: "Text",
  caption: "Subtitles",
  audio: "Audio",
};

export function layerGroupKey(item: ITrackItem): LayerGroupKey | null {
  if (item.type === "video") return "video";
  if (item.type === "image") return "image";
  if (item.type === "text") return "text";
  if (item.type === "caption") return "caption";
  if (item.type === "audio") return "audio";
  return null;
}

export function getLayerLabel(item: ITrackItem): string {
  if (item.name && item.name !== item.type) return item.name;
  const details = item.details ?? {};
  if (item.type === "caption" || item.type === "text") {
    const t = String(details.text ?? "").trim();
    if (t) return t.length > 40 ? `${t.slice(0, 40)}…` : t;
  }
  if (item.type === "audio") return "Voiceover";
  const src = details.src as string | undefined;
  if (src) {
    try {
      const name = decodeURIComponent(src.split("/").pop()?.split("?")[0] ?? "");
      if (name) return name;
    } catch {
      /* ignore */
    }
  }
  return item.type.charAt(0).toUpperCase() + item.type.slice(1);
}

export function isLayerLocked(item: ITrackItem): boolean {
  return Boolean(item.metadata?.locked);
}

export function isLayerHidden(item: ITrackItem): boolean {
  return (
    item.details?.visibility === "hidden" || Boolean(item.metadata?.hidden)
  );
}

export function groupLayersByType(
  trackItemIds: string[],
  trackItemsMap: Record<string, ITrackItem>
): Record<LayerGroupKey, ITrackItem[]> {
  const groups: Record<LayerGroupKey, ITrackItem[]> = {
    video: [],
    image: [],
    text: [],
    caption: [],
    audio: [],
  };

  for (let i = trackItemIds.length - 1; i >= 0; i--) {
    const item = trackItemsMap[trackItemIds[i]];
    if (!item) continue;
    const key = layerGroupKey(item);
    if (key) groups[key].push(item);
  }

  return groups;
}

export function selectLayer(
  stateManager: StateManager,
  id: string,
  additive = false
) {
  const { activeIds } = stateManager.getState();
  const next = additive
    ? activeIds.includes(id)
      ? activeIds.filter((x) => x !== id)
      : [...activeIds, id]
    : [id];

  stateManager.updateState(
    { activeIds: next },
    { updateHistory: false, kind: "layer:selection" }
  );
  void useStore.getState().setState({ activeIds: next });
}

export function setLayerLocked(
  id: string,
  locked: boolean,
  trackItemsMap: Record<string, ITrackItem>
) {
  const item = trackItemsMap[id];
  if (!item) return;
  dispatch(EDIT_OBJECT, {
    payload: {
      [id]: {
        metadata: { ...(item.metadata ?? {}), locked },
      },
    },
  });
}

export function setLayerHidden(
  id: string,
  hidden: boolean,
  trackItemsMap: Record<string, ITrackItem>
) {
  const item = trackItemsMap[id];
  if (!item) return;
  dispatch(EDIT_OBJECT, {
    payload: {
      [id]: {
        details: {
          ...(item.details ?? {}),
          visibility: hidden ? "hidden" : "visible",
        },
        metadata: { ...(item.metadata ?? {}), hidden },
      },
    },
  });
}

export function renameLayer(id: string, name: string) {
  dispatch(EDIT_OBJECT, {
    payload: {
      [id]: { name: name.trim() || "Layer" },
    },
  });
}

export function deleteLayers(stateManager: StateManager, ids: string[]) {
  if (!ids.length) return;
  stateManager.updateState(
    { activeIds: ids },
    { updateHistory: false, kind: "layer:selection" }
  );
  dispatch(LAYER_DELETE);
}

export function duplicateLayers(stateManager: StateManager, ids: string[]) {
  if (!ids.length) return;
  stateManager.updateState(
    { activeIds: ids },
    { updateHistory: false, kind: "layer:selection" }
  );
  dispatch(LAYER_CLONE);
}

export function moveLayerOrder(
  stateManager: StateManager,
  id: string,
  direction: "forward" | "backward"
) {
  reorderTrackItem(stateManager, id, direction);
}

export function formatLayerTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
