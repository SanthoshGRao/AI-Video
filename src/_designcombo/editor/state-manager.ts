import StateManager from "@designcombo/state";

/** Singleton state manager for the editor canvas + timeline. */
export const editorStateManager = new StateManager({
  size: {
    width: 1080,
    height: 1920,
  },
});
