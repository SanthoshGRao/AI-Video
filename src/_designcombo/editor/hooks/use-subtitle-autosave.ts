"use client";

import { useEffect, useRef } from "react";
import useStore from "../store/use-store";
import { useProjectEditor } from "../context/project-editor-context";
import {
  captionItemsToCues,
  saveProjectSubtitles,
} from "@/lib/editor/subtitle-persist";

const DEBOUNCE_MS = 1200;

export function useSubtitleAutosave() {
  const ctx = useProjectEditor();
  const trackItemsMap = useStore((s) => s.trackItemsMap);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ctx?.projectId || !ctx.subtitleStyle) return;

    const cues = captionItemsToCues(trackItemsMap);
    if (cues.length === 0) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveProjectSubtitles(
        ctx.projectId,
        cues,
        ctx.subtitleStyle!,
        ctx.subtitleStylePreset ?? "instagram_reels"
      ).catch((e) => console.error("[editor] subtitle save", e));
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [trackItemsMap, ctx?.projectId, ctx?.subtitleStyle, ctx?.subtitleStylePreset]);
}
