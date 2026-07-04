/** Typed event bus — modules MUST communicate through this, not direct refs. */

export type EditorEvents = {
  PLAYHEAD_MOVED: { time: number };
  CLIP_ADDED: { clipId: string };
  CLIP_REMOVED: { clipId: string };
  CLIP_UPDATED: { clipId: string };
  CLIP_TRIMMED: { clipId: string };
  CLIP_SPLIT: { sourceId: string; newId: string; at: number };
  CLIP_MOVED: { clipId: string; trackId: number; startTime: number };
  TRACK_ADDED: { trackId: number };
  TRACK_REMOVED: { trackId: number };
  TRACK_UPDATED: { trackId: number };
  SCENE_CHANGED: { sceneId: string };
  SELECTION_CHANGED: { kind: "clip" | "element" | "transition" | null; id: string | null };
  HISTORY_CHANGED: { canUndo: boolean; canRedo: boolean };
  PROJECT_LOADED: { projectId: string };
};

type EventName = keyof EditorEvents;
type Handler<E extends EventName> = (payload: EditorEvents[E]) => void;

class EventBus {
  private handlers = new Map<EventName, Set<Handler<EventName>>>();

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    const set = (this.handlers.get(event) as Set<Handler<E>> | undefined) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set as Set<Handler<EventName>>);
    return () => set.delete(handler);
  }

  emit<E extends EventName>(event: E, payload: EditorEvents[E]) {
    const set = this.handlers.get(event) as Set<Handler<E>> | undefined;
    if (!set) return;
    for (const h of set) {
      try {
        h(payload);
      } catch (err) {
        // Never let one bad listener break the bus.
        // eslint-disable-next-line no-console
        console.error("[EventBus]", event, err);
      }
    }
  }

  clear() {
    this.handlers.clear();
  }
}

export const eventBus = new EventBus();
