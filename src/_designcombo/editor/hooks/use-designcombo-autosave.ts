"use client";

import { useEffect, useRef } from "react";
import type StateManager from "@designcombo/state";
import {
  buildMediaUrlIndex,
  designStateToTimelineDocument,
} from "@/lib/editor/designcombo-to-timeline";
import { useProjectEditor } from "../context/project-editor-context";

const DEBOUNCE_MS = 1000;

export function useDesigncomboAutosave(
  projectId: string | undefined,
  stateManager: StateManager
) {
  const projectEditor = useProjectEditor();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;

    const save = async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        const state = stateManager.getState();
        const mediaIndex = projectEditor?.media
          ? buildMediaUrlIndex(projectEditor.media)
          : undefined;
        const doc = designStateToTimelineDocument(
          {
            tracks: state.tracks,
            trackItemsMap: state.trackItemsMap,
            trackItemIds: state.trackItemIds,
            size: state.size,
            duration: state.duration,
            fps: state.fps,
          },
          mediaIndex
        );

        await fetch(`/api/projects/${projectId}/timeline`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tracks: doc.tracks,
            clips: doc.clips,
            transitions: doc.transitions,
            textLayers: doc.textLayers,
            settings: doc.settings,
          }),
        });
      } catch (e) {
        console.error("[editor] autosave failed", e);
      } finally {
        savingRef.current = false;
      }
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void save(), DEBOUNCE_MS);
    };

    let lastSize = stateManager.getState().size;

    const subs = [
      stateManager.subscribeToUpdateTrackItem(() => schedule()),
      stateManager.subscribeToAddOrRemoveItems(() => schedule()),
      stateManager.subscribeToUpdateItemDetails(() => schedule()),
      stateManager.subscribeToUpdateTrackItemTiming(() => schedule()),
      stateManager.subscribeToDuration(() => schedule()),
      stateManager.subscribe((state) => {
        if (state.size.width !== lastSize.width || state.size.height !== lastSize.height) {
          lastSize = state.size;
          schedule();
        }
      }),
    ];

    return () => {
      subs.forEach((s) => s.unsubscribe());
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId, stateManager, projectEditor?.media]);
}
