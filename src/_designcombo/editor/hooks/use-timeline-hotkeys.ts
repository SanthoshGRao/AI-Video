"use client";

import { useEffect } from "react";
import { dispatch } from "@designcombo/events";
import {
  ACTIVE_SPLIT,
  LAYER_CLONE,
  LAYER_COPY,
  LAYER_DELETE,
  LAYER_PASTE,
  HISTORY_REDO,
  HISTORY_UNDO,
} from "@designcombo/state";
import { PLAYER_TOGGLE_PLAY } from "../constants/events";
import useStore from "../store/use-store";
import { getSafeCurrentFrame, getCurrentTime } from "../utils/time";

export function useTimelineHotkeys() {
  const { playerRef, fps, activeIds } = useStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch(e.shiftKey ? HISTORY_REDO : HISTORY_UNDO);
        return;
      }

      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch(HISTORY_REDO);
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        dispatch(PLAYER_TOGGLE_PLAY);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (activeIds.length === 0) return;
        e.preventDefault();
        dispatch(LAYER_DELETE);
        return;
      }

      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dispatch(LAYER_CLONE);
        return;
      }

      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        dispatch(LAYER_COPY);
        return;
      }

      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        dispatch(LAYER_PASTE);
        return;
      }

      if (e.key === "s" && !mod) {
        e.preventDefault();
        dispatch(ACTIVE_SPLIT, {
          payload: {},
          options: {
            time: getCurrentTime()
          }
        });
        return;
      }

      const frameStep = e.shiftKey ? Math.round(fps) : Math.round(fps / 4);
      if (e.key === "ArrowLeft" && playerRef?.current) {
        e.preventDefault();
        const frame = getSafeCurrentFrame(playerRef);
        playerRef.current.seekTo(Math.max(0, frame - frameStep));
        return;
      }
      if (e.key === "ArrowRight" && playerRef?.current) {
        e.preventDefault();
        const frame = getSafeCurrentFrame(playerRef);
        playerRef.current.seekTo(frame + frameStep);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playerRef, fps, activeIds]);
}
