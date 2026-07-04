"use client";

import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CanvasZoomControls({
  zoom,
  onFit,
  onFill,
  onActual,
  onZoomIn,
  onZoomOut,
}: {
  zoom: number;
  onFit: () => void;
  onFill: () => void;
  onActual: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="absolute top-4 right-4 z-[130] flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-900/90 px-2 py-1.5 text-xs text-zinc-100 shadow-lg backdrop-blur">
      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-zinc-100 hover:bg-white/10" onClick={onFit} title="Fit to screen">
        <Minimize2 className="h-3.5 w-3.5" /> Fit
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-zinc-100 hover:bg-white/10" onClick={onFill} title="Fill screen">
        <Maximize2 className="h-3.5 w-3.5" /> Fill
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-zinc-100 hover:bg-white/10" onClick={onZoomOut} title="Zoom out">
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <button type="button" className="h-8 min-w-12 rounded-md px-2 font-medium hover:bg-white/10" onClick={onActual} title="100% zoom">
        {Math.round(zoom * 100)}%
      </button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-zinc-100 hover:bg-white/10" onClick={onZoomIn} title="Zoom in">
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-zinc-100 hover:bg-white/10" onClick={onFit} title="Reset zoom">
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
