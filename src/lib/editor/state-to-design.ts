import type { IDesign } from "@designcombo/types";
import type StateManager from "@designcombo/state";

/** Snapshot editor state manager state as an IDesign for DESIGN_LOAD merges. */
export function editorStateToDesign(
  state: ReturnType<StateManager["getState"]>
): IDesign {
  return {
    id: (state as { id?: string }).id ?? "project",
    fps: state.fps,
    tracks: state.tracks,
    trackItemIds: state.trackItemIds,
    trackItemsMap: state.trackItemsMap,
    transitionIds: state.transitionIds ?? [],
    transitionsMap: state.transitionsMap ?? {},
    size: state.size,
    duration: state.duration,
    background: state.background ?? { type: "color", value: "#000000" },
  };
}
