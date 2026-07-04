"use client";

import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import type { ICaption, ITrackItem } from "@designcombo/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CaptionTimingInspector({
  trackItem,
}: {
  trackItem: ITrackItem & ICaption;
}) {
  const patch = (partial: {
    display?: { from: number; to: number };
    details?: Record<string, unknown>;
  }) => {
    dispatch(EDIT_OBJECT, {
      payload: { [trackItem.id]: partial },
    });
  };

  const topVal =
    typeof trackItem.details.top === "string"
      ? trackItem.details.top
      : `${trackItem.details.top ?? 0}px`;

  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 pb-4">
      <Label className="text-xs font-semibold">Subtitle</Label>
      <Textarea
        className="min-h-[72px] text-sm"
        value={trackItem.details.text ?? ""}
        onChange={(e) => patch({ details: { text: e.target.value } })}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Start (ms)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={trackItem.display.from}
            onChange={(e) =>
              patch({
                display: {
                  from: Number(e.target.value),
                  to: trackItem.display.to,
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
            value={trackItem.display.to}
            onChange={(e) =>
              patch({
                display: {
                  from: trackItem.display.from,
                  to: Number(e.target.value),
                },
              })
            }
          />
        </div>
      </div>
      <div>
        <Label className="text-[10px] text-muted-foreground">Position</Label>
        <Select
          value={
            String(topVal).includes("78") || parseFloat(String(topVal)) > 500
              ? "bottom"
              : parseFloat(String(topVal)) > 300
                ? "center"
                : "top"
          }
          onValueChange={(v) => {
            const h = 1920;
            const top =
              v === "bottom" ? `${Math.round(h * 0.78)}px` : v === "center" ? `${Math.round(h * 0.42)}px` : `${Math.round(h * 0.08)}px`;
            patch({ details: { top } });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="top">Top</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="bottom">Bottom</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
