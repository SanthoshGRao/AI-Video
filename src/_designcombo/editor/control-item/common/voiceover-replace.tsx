"use client";

import { dispatch } from "@designcombo/events";
import { LAYER_REPLACE } from "@designcombo/state";
import type { IAudio, ITrackItem } from "@designcombo/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProjectEditor } from "../../context/project-editor-context";

export function VoiceoverReplace({ trackItem }: { trackItem: ITrackItem & IAudio }) {
  const ctx = useProjectEditor();
  const narrationUrl = ctx?.voiceoverUrl;

  if (!narrationUrl) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-gray-200 pb-4">
      <Label className="text-xs font-semibold">Narration</Label>
      <p className="text-[10px] text-muted-foreground">
        Replace this clip with the project voiceover track.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="text-xs"
        onClick={() => {
          dispatch(LAYER_REPLACE, {
            payload: {
              [trackItem.id]: {
                details: { src: narrationUrl },
              },
            },
          });
        }}
      >
        Use project voiceover
      </Button>
    </div>
  );
}
