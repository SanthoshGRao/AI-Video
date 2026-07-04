"use client";

import { dispatch } from "@designcombo/events";
import {
  LAYER_CLONE,
  LAYER_DELETE,
} from "@designcombo/state";
import {
  AlignCenter,
  ArrowDown,
  ArrowUp,
  Copy,
  Lock,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import useStore from "../store/use-store";
import { editorStateManager } from "../state-manager";
import {
  centerElementOnCanvas,
  isItemLocked,
  reorderTrackItem,
  setItemsLocked,
} from "../utils/canvas-transform";
import { getTargetById } from "../utils/target";

export function CanvasToolbar({
  canvasSize,
}: {
  canvasSize: { width: number; height: number };
}) {
  const stateManager = editorStateManager;
  const { activeIds, trackItemsMap } = useStore();

  if (activeIds.length === 0) return null;

  const items = activeIds
    .map((id) => trackItemsMap[id])
    .filter((item) => item && item.type !== "audio");
  if (items.length === 0) return null;

  const allLocked = items.every((item) => isItemLocked(item));
  const anyLocked = items.some((item) => isItemLocked(item));

  const handleCenter = () => {
    for (const id of activeIds) {
      const item = trackItemsMap[id];
      if (!item || item.type === "audio" || isItemLocked(item)) continue;
      const el = getTargetById(id);
      if (el) centerElementOnCanvas(id, el, canvasSize.width, canvasSize.height);
    }
  };

  const handleLayerOrder = (direction: "forward" | "backward") => {
    const ordered = [...activeIds].reverse();
    for (const id of ordered) {
      if (isItemLocked(trackItemsMap[id])) continue;
      reorderTrackItem(stateManager, id, direction);
    }
  };

  return (
    <div
      className="absolute left-1/2 top-3 z-[120] flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-white/10 bg-zinc-900/95 px-1 py-1 shadow-lg backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-zinc-200 hover:bg-white/10"
        title="Center on canvas"
        disabled={anyLocked}
        onClick={handleCenter}
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-zinc-200 hover:bg-white/10"
        title="Bring forward"
        disabled={anyLocked}
        onClick={() => handleLayerOrder("forward")}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-zinc-200 hover:bg-white/10"
        title="Send backward"
        disabled={anyLocked}
        onClick={() => handleLayerOrder("backward")}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
      <div className="mx-0.5 h-5 w-px bg-white/15" />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-zinc-200 hover:bg-white/10"
        title={allLocked ? "Unlock layer" : "Lock layer"}
        onClick={() =>
          setItemsLocked(activeIds, !allLocked, trackItemsMap)
        }
      >
        {allLocked ? (
          <Unlock className="h-4 w-4" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-zinc-200 hover:bg-white/10"
        title="Duplicate"
        disabled={anyLocked}
        onClick={() => dispatch(LAYER_CLONE)}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-red-400 hover:bg-red-500/20"
        title="Delete"
        onClick={() => dispatch(LAYER_DELETE)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
