import { Player } from "../player";
import { useRef, useImperativeHandle, forwardRef } from "react";
import useStore from "../store/use-store";
import StateManager from "@designcombo/state";
import SceneEmpty from "./empty";
import Board from "./board";
import useZoom from "../hooks/use-zoom";
import { SceneInteractions } from "./interactions";
import { SceneRef } from "./scene.types";
import { CanvasAlignmentGuides } from "./canvas-alignment-guides";
import { CanvasToolbar } from "./canvas-toolbar";
import { useCanvasHotkeys } from "../hooks/use-canvas-hotkeys";
import { CanvasZoomControls } from "./canvas-zoom-controls";

const Scene = forwardRef<
  SceneRef,
  {
    stateManager: StateManager;
  }
>(({ stateManager }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { size, trackItemIds, activeIds } = useStore();
  useCanvasHotkeys();
  const { zoom, recalculateZoom, fitToScreen, fillScreen, zoom100, zoomIn, zoomOut } = useZoom(
    containerRef as React.RefObject<HTMLDivElement>,
    size
  );

  // Expose the recalculateZoom function to parent
  useImperativeHandle(ref, () => ({
    recalculateZoom
  }));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        flex: 1,
        overflow: "auto",
        background:
          "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.28) 1px, transparent 0)",
        backgroundSize: "18px 18px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: 0,
        minWidth: 0,
        overscrollBehavior: "contain"
      }}
      ref={containerRef}
    >
      {trackItemIds.length === 0 && <SceneEmpty />}
      <div
        style={{
          width: size.width,
          height: size.height,
          background: "#000000",
          transform: `scale(${zoom})`,
          position: "absolute",
          boxShadow: "0 22px 70px rgba(15, 23, 42, 0.28)",
          borderRadius: 2
        }}
        className="player-container bg-sidebar"
      >
        <div
          style={{
            position: "absolute",
            zIndex: 100,
            pointerEvents: "none",
            width: size.width,
            height: size.height,
            background: "transparent",
            boxShadow: "0 0 0 5000px var(--card)"
          }}
        />
        <Board size={size}>
          <Player />
          <CanvasAlignmentGuides width={size.width} height={size.height} />
          {activeIds.length > 0 && (
            <CanvasToolbar canvasSize={size} />
          )}
          <SceneInteractions
            stateManager={stateManager}
            containerRef={containerRef as React.RefObject<HTMLDivElement>}
            zoom={zoom}
            size={size}
          />
        </Board>
      </div>
      <CanvasZoomControls
        zoom={zoom}
        onFit={fitToScreen}
        onFill={fillScreen}
        onActual={zoom100}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
      />
    </div>
  );
});

Scene.displayName = "Scene";

export default Scene;
