"use client";

import { useEffect } from "react";
import type StateManager from "@designcombo/state";
import { filter, subject } from "@designcombo/events";
import { TIMELINE_PREFIX, TIMELINE_SEEK } from "@designcombo/timeline";
import useStore from "../store/use-store";

/**
 * Keeps Remotion preview in sync with timeline edits (seek on scrub, clip moves, splits).
 */
export function useTimelinePreviewSync(stateManager: StateManager) {
  const { playerRef, fps } = useStore();

  useEffect(() => {
    const timelineEvents = subject.pipe(
      filter(({ key }) => key.startsWith(TIMELINE_PREFIX))
    );

    const sub = timelineEvents.subscribe((obj) => {
      if (obj.key === TIMELINE_SEEK) {
        const time = obj.value?.payload?.time;
        if (playerRef?.current && typeof time === "number") {
          playerRef.current.seekTo(Math.round((time / 1000) * fps));
        }
      }
    });

    return () => sub.unsubscribe();
  }, [playerRef, fps]);

  useEffect(() => {
    const seekFromMs = (ms: number) => {
      if (playerRef?.current) {
        playerRef.current.seekTo(Math.round((ms / 1000) * fps));
      }
    };

    const timingSub = stateManager.subscribeToUpdateTrackItemTiming(
      ({ trackItemsMap, changedDisplayIds }) => {
        if (!changedDisplayIds?.length || !playerRef?.current) return;
        const id = changedDisplayIds[0];
        const item = trackItemsMap[id];
        if (item?.display?.from != null) {
          seekFromMs(item.display.from);
        }
      }
    );

    return () => timingSub.unsubscribe();
  }, [stateManager, playerRef, fps]);
}
