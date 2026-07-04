"use client";

import { useEffect } from "react";
import useStore from "../store/use-store";
import { getTargetById } from "../utils/target";
import { isItemLocked, nudgeElement } from "../utils/canvas-transform";

const NUDGE = 1;
const NUDGE_FINE = 10;

export function useCanvasHotkeys() {
  const { activeIds, trackItemsMap } = useStore();

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

      const step = e.shiftKey ? NUDGE_FINE : NUDGE;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;

      if (activeIds.length === 0) return;
      e.preventDefault();

      for (const id of activeIds) {
        const item = trackItemsMap[id];
        if (!item || item.type === "audio" || isItemLocked(item)) continue;
        const el = getTargetById(id);
        if (el) nudgeElement(id, el, dx, dy);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIds, trackItemsMap]);
}
