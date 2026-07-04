"use client";

import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

function parsePx(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return Number.parseFloat(String(v).replace("px", "")) || 0;
}

function parseRotation(transform?: string, rotate?: string): number {
  const m = (transform ?? "").match(/rotate\(([-\d.]+)deg\)/);
  if (m) return Number.parseFloat(m[1]);
  if (rotate) return Number.parseFloat(String(rotate).replace("deg", "")) || 0;
  return 0;
}

export function PositionInspector({ trackItem }: { trackItem: ITrackItem }) {
  const d = trackItem.details ?? {};
  const x = parsePx(d.left);
  const y = parsePx(d.top);
  const w = (d.width as number) ?? 100;
  const h = (d.height as number) ?? 100;
  const rot = parseRotation(d.transform as string, d.rotate as string);
  const opacity = (d.opacity as number) ?? 100;

  const patch = (partial: Record<string, unknown>) => {
    dispatch(EDIT_OBJECT, {
      payload: { [trackItem.id]: { details: { ...(trackItem.details || {}), ...partial } } },
    });
  };

  if (trackItem.type === "audio") return null;

  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 pb-4">
      <Label className="text-xs font-semibold">Position & transform</Label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">X</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={Math.round(x)}
            onChange={(e) => patch({ left: `${Number(e.target.value)}px` })}
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Y</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={Math.round(y)}
            onChange={(e) => patch({ top: `${Number(e.target.value)}px` })}
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Width</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={Math.round(w)}
            onChange={(e) => patch({ width: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Height</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={Math.round(h)}
            onChange={(e) => patch({ height: Number(e.target.value) })}
          />
        </div>
      </div>
      <div>
        <Label className="text-[10px] text-muted-foreground">
          Rotation ({rot}°)
        </Label>
        <Slider
          value={[rot]}
          min={-180}
          max={180}
          step={1}
          onValueChange={([v]) =>
            patch({ transform: `rotate(${v}deg)`, rotate: `${v}deg` })
          }
        />
      </div>
      <div>
        <Label className="text-[10px] text-muted-foreground">
          Opacity ({opacity}%)
        </Label>
        <Slider
          value={[opacity]}
          min={0}
          max={100}
          step={1}
          onValueChange={([v]) => patch({ opacity: v })}
        />
      </div>
    </div>
  );
}
