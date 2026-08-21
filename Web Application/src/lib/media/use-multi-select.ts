"use client";

import { useCallback, useRef, useState } from "react";

export interface MultiSelectClickModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface UseMultiSelectResult {
  selectedIds: Set<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;
  /** Wire to a card's onClick. Shift = range-select from last anchor; ctrl/cmd = toggle; plain click = select only this item. */
  handleCardClick: (id: string, mods: MultiSelectClickModifiers) => void;
  /** Wire to a card's checkbox. Always toggles regardless of modifiers, and becomes the new range anchor. */
  handleCheckboxToggle: (id: string, checked: boolean) => void;
  selectOnly: (id: string) => void;
  clearSelection: () => void;
}

/**
 * orderedIds = current visual order of selectable items, recomputed by the
 * caller each render so shift-range selection matches what's on screen.
 */
export function useMultiSelect(orderedIds: string[]): UseMultiSelectResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);

  const selectOnly = useCallback((id: string) => {
    anchorRef.current = id;
    setSelectedIds(new Set([id]));
  }, []);

  const clearSelection = useCallback(() => {
    anchorRef.current = null;
    setSelectedIds(new Set());
  }, []);

  const handleCheckboxToggle = useCallback((id: string, checked: boolean) => {
    anchorRef.current = id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleCardClick = useCallback(
    (id: string, mods: MultiSelectClickModifiers) => {
      if (mods.shiftKey && anchorRef.current) {
        const from = orderedIds.indexOf(anchorRef.current);
        const to = orderedIds.indexOf(id);
        if (from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from];
          setSelectedIds(new Set(orderedIds.slice(start, end + 1)));
          return;
        }
      }
      if (mods.ctrlKey || mods.metaKey) {
        anchorRef.current = id;
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        return;
      }
      selectOnly(id);
    },
    [orderedIds, selectOnly]
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected: (id) => selectedIds.has(id),
    handleCardClick,
    handleCheckboxToggle,
    selectOnly,
    clearSelection,
  };
}
