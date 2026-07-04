"use client";

import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ObjectFitControl({ trackItem }: { trackItem: ITrackItem }) {
  const fit = (trackItem.details?.objectFit as string) ?? "cover";

  return (
    <div className="flex flex-col gap-2 border-b border-gray-200 pb-4">
      <Label className="text-xs font-semibold">Fit</Label>
      <Select
        value={fit}
        onValueChange={(v) => {
          dispatch(EDIT_OBJECT, {
            payload: {
              [trackItem.id]: { details: { objectFit: v } },
            },
          });
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="cover">Cover (fill frame)</SelectItem>
          <SelectItem value="contain">Contain</SelectItem>
          <SelectItem value="fill">Stretch</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
