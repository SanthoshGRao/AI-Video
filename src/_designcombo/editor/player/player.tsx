import React, { useEffect, useRef } from "react";
import useStore from "../store/use-store";
import { playbackEngine } from "@/lib/engine/playback";
import { Compositor } from "@/lib/engine/compositor";
import { assetRegistry } from "@/lib/engine/asset-registry";

/** In-browser preview player (not used for Remotion server export). */
const Player = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { size, background, duration, fps, trackItemsMap, trackItemIds } = useStore();
  const compositorRef = useRef<Compositor | null>(null);

  useEffect(() => {
    playbackEngine.init(duration, fps);
  }, [duration, fps]);

  useEffect(() => {
    const loadAssets = async () => {
      for (const item of Object.values(trackItemsMap)) {
        const src = item.details?.src;
        if (!src) continue;
        if (item.type === "video") await assetRegistry.loadVideo(src).catch(console.error);
        else if (item.type === "image") await assetRegistry.loadImage(src).catch(console.error);
        else if (item.type === "audio") await assetRegistry.loadAudio(src).catch(console.error);
      }
    };
    void loadAssets();
  }, [trackItemsMap]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    if (!compositorRef.current) {
      compositorRef.current = new Compositor(ctx, size.width, size.height);
    } else {
      compositorRef.current.setDimensions(size.width, size.height);
    }

    const unsubscribe = playbackEngine.onRender((timeMs) => {
      if (!compositorRef.current) return;
      const store = useStore.getState();
      const activeItems: import("@designcombo/types").ITrackItem[] = [];
      for (const track of store.tracks) {
        for (const id of track.items) {
          const item = store.trackItemsMap[id];
          if (!item || item.type === "audio") continue;
          const start = item.display?.from ?? 0;
          const end = item.display?.to ?? store.duration;
          if (timeMs >= start && timeMs <= end) activeItems.push(item);
        }
      }
      void compositorRef.current.renderFrame(timeMs, activeItems, store.background);
    });

    return () => {
      unsubscribe();
    };
  }, [size]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e1e1e",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
};

export default Player;
