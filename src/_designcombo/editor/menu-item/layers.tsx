"use client";

import { useMemo, useState } from "react";
import {
  Captions,
  Copy,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Lock,
  Music,
  Trash2,
  Type,
  Unlock,
  GripVertical
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import useStore from "../store/use-store";
import { editorStateManager } from "../state-manager";
import {
  deleteLayers,
  duplicateLayers,
  formatLayerTime,
  getLayerLabel,
  isLayerHidden,
  isLayerLocked,
  renameLayer,
  selectLayer,
  setLayerHidden,
  setLayerLocked,
} from "../utils/layer-actions";
import type { ITrackItem } from "@designcombo/types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const TYPE_ICON: Record<string, any> = {
  video: Film,
  image: ImageIcon,
  text: Type,
  caption: Captions,
  audio: Music,
};

function SortableLayerRow({
  item,
  isSelected,
  onSelect,
}: {
  item: ITrackItem;
  isSelected: boolean;
  onSelect: (id: string, additive: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : "auto",
    opacity: isDragging ? 0.8 : 1,
  };

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const locked = isLayerLocked(item);
  const hidden = isLayerHidden(item);
  const canDelete = item.type !== "audio";
  const Icon = TYPE_ICON[item.type] || Film;

  const commitRename = () => {
    setEditing(false);
    if (nameDraft.trim()) renameLayer(item.id, nameDraft);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 rounded-xl border px-2 py-2 transition-colors mb-1",
        isSelected
          ? "border-[#8b3dff]/40 bg-violet-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
        hidden && "opacity-50"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "flex shrink-0 cursor-grab items-center justify-center p-1 text-slate-400 hover:text-slate-600 active:cursor-grabbing",
          locked && "opacity-30 cursor-not-allowed"
        )}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      
      <div className="flex shrink-0 p-1 text-slate-500">
        <Icon className="h-3.5 w-3.5" />
      </div>

      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start text-left py-0.5"
        onClick={(e) => onSelect(item.id, e.shiftKey || e.metaKey || e.ctrlKey)}
        onDoubleClick={() => {
          setNameDraft(getLayerLabel(item));
          setEditing(true);
        }}
      >
        {editing ? (
          <Input
            className="h-6 text-xs"
            value={nameDraft}
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="w-full truncate text-xs font-medium text-slate-800">
              {getLayerLabel(item)}
            </span>
            <span className="text-[10px] tabular-nums text-slate-400">
              {formatLayerTime(item.display.from)} –{" "}
              {formatLayerTime(item.display.to)}
            </span>
          </>
        )}
      </button>

      <button
        type="button"
        title={hidden ? "Show layer" : "Hide layer"}
        className="shrink-0 p-1 text-slate-400 hover:text-slate-700"
        onClick={(e) => {
          e.stopPropagation();
          const map = editorStateManager.getState().trackItemsMap;
          setLayerHidden(item.id, !hidden, map);
        }}
      >
        {hidden ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>

      <button
        type="button"
        title={locked ? "Unlock layer" : "Lock layer"}
        className="shrink-0 p-1 text-slate-400 hover:text-slate-700"
        onClick={(e) => {
          e.stopPropagation();
          const map = editorStateManager.getState().trackItemsMap;
          setLayerLocked(item.id, !locked, map);
        }}
      >
        {locked ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <Unlock className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60" />
        )}
      </button>

      <button
        type="button"
        title="Duplicate"
        disabled={locked}
        className="shrink-0 p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
        onClick={(e) => {
          e.stopPropagation();
          duplicateLayers(editorStateManager, [item.id]);
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>

      {canDelete ? (
        <button
          type="button"
          title="Delete"
          className="shrink-0 p-1 text-slate-400 hover:text-red-600"
          onClick={(e) => {
            e.stopPropagation();
            deleteLayers(editorStateManager, [item.id]);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function Layers() {
  const { trackItemIds, trackItemsMap, activeIds } = useStore();

  const displayIds = useMemo(() => {
    return [...trackItemIds].reverse();
  }, [trackItemIds]);

  const items = useMemo(() => {
    return displayIds
      .map((id) => trackItemsMap[id])
      .filter(Boolean) as ITrackItem[];
  }, [displayIds, trackItemsMap]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = displayIds.indexOf(active.id as string);
      const newIndex = displayIds.indexOf(over.id as string);

      const newDisplayIds = arrayMove(displayIds, oldIndex, newIndex);
      const newTrackItemIds = [...newDisplayIds].reverse();

      const state = editorStateManager.getState();
      const tracks = state.tracks.map((track) => {
        const trackItems = [...track.items].sort(
          (a, b) => newTrackItemIds.indexOf(a) - newTrackItemIds.indexOf(b)
        );
        return { ...track, items: trackItems };
      });

      editorStateManager.updateState(
        { trackItemIds: newTrackItemIds, tracks },
        { updateHistory: true, kind: "update" }
      );
    }
  };

  const handleSelect = (id: string, additive: boolean) => {
    selectLayer(editorStateManager, id, additive);
  };

  return (
    <div data-testid="panel-layers" className="flex h-full w-full flex-col bg-[#f8fafc]">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">Layers</h2>
        <p className="text-[11px] text-slate-500">
          Top items render in front. Drag to reorder.
        </p>
      </div>

      <ScrollArea className="flex-1 px-3 py-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-xs text-slate-500">
            No layers yet. Add media from Uploads or drag clips to the timeline.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={displayIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col">
                {items.map((item) => (
                  <SortableLayerRow
                    key={item.id}
                    item={item}
                    isSelected={activeIds.includes(item.id)}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>

      {activeIds.length > 1 && (
        <div className="border-t border-slate-200 p-2 flex gap-1">
          <button
            type="button"
            className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => duplicateLayers(editorStateManager, activeIds)}
          >
            Duplicate ({activeIds.length})
          </button>
          <button
            type="button"
            className="rounded-md border border-red-200 px-2 py-1.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
            onClick={() => deleteLayers(editorStateManager, activeIds)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
