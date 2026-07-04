"use client";

import { useMemo } from "react";
import { dispatch } from "@designcombo/events";
import { DESIGN_LOAD } from "@designcombo/state";
import useStore from "../store/use-store";
import { useProjectEditor } from "../context/project-editor-context";
import { editorStateManager } from "../state-manager";
import { mergeSubtitlesIntoDesign } from "@/lib/editor/subtitle-design";
import { editorStateToDesign } from "@/lib/editor/state-to-design";
import { captionItemsToCues } from "@/lib/editor/subtitle-persist";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SubtitleStyle } from "@/lib/subtitles/types";
import { PLAYER_SEEK } from "../constants/events";
import { cn } from "@/lib/utils";

const POSITIONS = ["top", "center", "bottom"] as const;

export function ProjectSubtitles() {
  const ctx = useProjectEditor();
  const { trackItemsMap, activeIds, size } = useStore();

  const cues = useMemo(
    () => captionItemsToCues(trackItemsMap),
    [trackItemsMap]
  );

  const selectCue = (cueId: string, startMs: number) => {
    const capId = Object.values(trackItemsMap).find(
      (i) =>
        i.type === "caption" &&
        ((i.metadata?.cueId as string) === cueId || i.id === `sub-${cueId}`)
    )?.id;
    if (capId) {
      editorStateManager.updateState({
        activeIds: [capId],
      });
    }
    dispatch(PLAYER_SEEK, { payload: { time: startMs } });
  };

  const applyStylePatch = (patch: Partial<SubtitleStyle>) => {
    if (!ctx?.subtitleStyle) return;
    const style = { ...ctx.subtitleStyle, ...patch };
    const design = mergeSubtitlesIntoDesign(
      editorStateToDesign(editorStateManager.getState()),
      cues.length ? cues : ctx.subtitleCues ?? [],
      style,
      size.width,
      size.height
    );
    dispatch(DESIGN_LOAD, { payload: design });
  };

  if (!ctx?.projectId) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        Open a saved project to edit subtitles.
      </p>
    );
  }

  const list = cues.length > 0 ? cues : ctx.subtitleCues ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <Label className="text-sm font-medium">Project subtitles</Label>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {list.length} cue{list.length === 1 ? "" : "s"} · autosaved to project
        </p>
      </div>

      {ctx.subtitleStyle && (
        <div className="flex flex-col gap-2 border-b border-gray-200 px-4 py-3">
          <Label className="text-xs">Global style</Label>
          <Select
            value={ctx.subtitleStyle.position}
            onValueChange={(v) =>
              applyStylePatch({
                position: v as SubtitleStyle["position"],
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-1 p-2">
          {list.map((cue) => {
            const active =
              activeIds.length === 1 &&
              (trackItemsMap[activeIds[0]]?.metadata?.cueId === cue.id ||
                activeIds[0] === `sub-${cue.id}`);
            return (
              <li key={cue.id}>
                <button
                  type="button"
                  onClick={() => selectCue(cue.id, cue.startMs)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-xs transition-colors",
                    active
                      ? "border-[#00c4cc] bg-[#00c4cc]/10"
                      : "border-transparent hover:bg-gray-100"
                  )}
                >
                  <span className="text-[10px] text-muted-foreground">
                    {(cue.startMs / 1000).toFixed(1)}s –{" "}
                    {(cue.endMs / 1000).toFixed(1)}s
                  </span>
                  <p className="mt-0.5 line-clamp-2 font-medium text-gray-900">
                    {cue.text || "(empty)"}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
        {list.length === 0 && (
          <p className="px-4 py-4 text-xs text-muted-foreground">
            No subtitles yet. Use Captions → Generate or import from your
            project pipeline.
          </p>
        )}
      </ScrollArea>

      <div className="border-t border-gray-200 p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => {
            const t = Date.now();
            const id = `manual-${t}`;
            const newCue = {
              id,
              startMs: t % 10000,
              endMs: (t % 10000) + 2000,
              text: "New subtitle",
              words: [],
            };
            const style = ctx.subtitleStyle!;
            const design = mergeSubtitlesIntoDesign(
              editorStateToDesign(editorStateManager.getState()),
              [...list, newCue],
              style,
              size.width,
              size.height
            );
            dispatch(DESIGN_LOAD, { payload: design });
          }}
          disabled={!ctx.subtitleStyle}
        >
          Add subtitle block
        </Button>
      </div>
    </div>
  );
}
