"use client";

import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function DisplayDurationControl({ trackItem }: { trackItem: ITrackItem }) {
  const from = trackItem.display?.from ?? 0;
  const to = trackItem.display?.to ?? 3000;

  return (
    <div className="flex flex-col gap-2 border-b border-gray-200 pb-4">
      <Label className="text-xs font-semibold">Clip duration</Label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Start (ms)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={from}
            onChange={(e) =>
              dispatch(EDIT_OBJECT, {
                payload: {
                  [trackItem.id]: {
                    display: { from: Number(e.target.value), to },
                  },
                },
              })
            }
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">End (ms)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={to}
            onChange={(e) =>
              dispatch(EDIT_OBJECT, {
                payload: {
                  [trackItem.id]: {
                    display: { from, to: Number(e.target.value) },
                  },
                },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
