export const MEDIA_SELECTION_DND_TYPE = "application/x-media-selection";

export interface MediaDragPayload {
  ids: string[];
}

/** If the dragged card is part of the current selection, drag the whole selection; otherwise just that one card. */
export function buildMediaDragPayload(
  selectedIds: Set<string>,
  draggedId: string
): MediaDragPayload {
  return selectedIds.has(draggedId)
    ? { ids: Array.from(selectedIds) }
    : { ids: [draggedId] };
}

export function setMediaDragPayload(
  dataTransfer: DataTransfer,
  payload: MediaDragPayload
): void {
  dataTransfer.setData(MEDIA_SELECTION_DND_TYPE, JSON.stringify(payload));
  dataTransfer.effectAllowed = "move";
}

export function readMediaDragPayload(
  dataTransfer: DataTransfer
): MediaDragPayload | null {
  const raw = dataTransfer.getData(MEDIA_SELECTION_DND_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.ids)) return null;
    const ids = parsed.ids.filter((x: unknown): x is string => typeof x === "string");
    return ids.length > 0 ? { ids } : null;
  } catch {
    return null;
  }
}
