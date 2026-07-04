"use client";

import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const ADJUSTMENTS = [
  { id: "brightness", label: "Brightness", defaultValue: [50] },
  { id: "contrast", label: "Contrast", defaultValue: [50] },
  { id: "saturation", label: "Saturation", defaultValue: [50] },
  { id: "temperature", label: "Temperature", defaultValue: [50] },
  { id: "tint", label: "Tint", defaultValue: [50] },
  { id: "highlights", label: "Highlights", defaultValue: [50] },
  { id: "shadows", label: "Shadows", defaultValue: [50] },
  { id: "vignette", label: "Vignette", defaultValue: [0] },
  { id: "sharpness", label: "Sharpness", defaultValue: [0] },
];

export function AdjustmentView() {
  return (
    <PanelView title="Adjustments">
      <div className="flex flex-col gap-6 px-4 py-6">
        <div className="text-sm text-muted-foreground mb-2">
          Global color and lighting adjustments
        </div>
        
        {ADJUSTMENTS.map((adjustment) => (
          <div key={adjustment.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label htmlFor={adjustment.id} className="text-xs font-medium">
                {adjustment.label}
              </Label>
              <span className="text-xs text-muted-foreground w-8 text-right">
                {adjustment.defaultValue[0]}
              </span>
            </div>
            <Slider
              id={adjustment.id}
              defaultValue={adjustment.defaultValue}
              max={100}
              min={0}
              step={1}
              className="w-full"
            />
          </div>
        ))}
      </div>
    </PanelView>
  );
}
