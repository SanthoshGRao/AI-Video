"use client";

import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Volume2, VolumeX } from "lucide-react";

export function MuteToggle({
  trackItem,
  volumeKey = "volume",
}: {
  trackItem: ITrackItem;
  volumeKey?: string;
}) {
  const vol = (trackItem.details?.[volumeKey] as number) ?? 100;
  const muted = vol === 0;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-4">
      <Label className="text-xs font-semibold">Audio</Label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-xs"
        onClick={() => {
          const next = muted ? 100 : 0;
          dispatch(EDIT_OBJECT, {
            payload: {
              [trackItem.id]: { details: { [volumeKey]: next } },
            },
          });
        }}
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        {muted ? "Unmute" : "Mute"}
      </Button>
    </div>
  );
}
