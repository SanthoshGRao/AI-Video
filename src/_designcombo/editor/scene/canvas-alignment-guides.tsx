"use client";

import { useCanvasUiStore } from "../store/use-canvas-ui-store";

export function CanvasAlignmentGuides({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const snapGuides = useCanvasUiStore((s) => s.snapGuides);
  const showSafeArea = useCanvasUiStore((s) => s.showSafeArea);
  const showGrid = useCanvasUiStore((s) => s.showGrid);

  const safeX = width * 0.05;
  const safeY = height * 0.05;
  const safeW = width * 0.9;
  const safeH = height * 0.9;
  const titleX = width * 0.1;
  const titleY = height * 0.1;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[60]"
      style={{ width, height }}
    >
      <div
        className="absolute bg-[#00c4cc]/50"
        style={{ left: width / 2, top: 0, width: 1, height }}
      />
      <div
        className="absolute bg-[#00c4cc]/50"
        style={{ top: height / 2, left: 0, height: 1, width }}
      />

      {[0.25, 0.5, 0.75].map((ratio) => (
        <div
          key={`rule-v-${ratio}`}
          className="absolute bg-white/10"
          style={{ left: width * ratio, top: 0, width: 1, height }}
        />
      ))}
      {[0.25, 0.5, 0.75].map((ratio) => (
        <div
          key={`rule-h-${ratio}`}
          className="absolute bg-white/10"
          style={{ top: height * ratio, left: 0, height: 1, width }}
        />
      ))}

      {showSafeArea && (
        <>
          <div
            className="absolute border border-dashed border-white/35"
            style={{
              left: safeX,
              top: safeY,
              width: safeW,
              height: safeH,
            }}
          />
          <div
            className="absolute border border-dashed border-amber-300/35"
            style={{
              left: titleX,
              top: titleY,
              width: width - titleX * 2,
              height: height - titleY * 2,
            }}
          />
        </>
      )}

      {showGrid && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      )}

      {snapGuides.vertical.map((x, i) => (
        <div
          key={`v-${i}-${x}`}
          className="absolute bg-[#8b3dff]"
          style={{ left: x, top: 0, width: 1, height }}
        />
      ))}
      {snapGuides.horizontal.map((y, i) => (
        <div
          key={`h-${i}-${y}`}
          className="absolute bg-[#8b3dff]"
          style={{ top: y, left: 0, height: 1, width }}
        />
      ))}
    </div>
  );
}
