import { getInputProps } from "remotion";
import ExportPlayer from "./export-player";
import type { RenderTrack, RenderTrackItem, RenderTransition } from "@/lib/editor/render-types";

export function RemotionRoot() {
  const inputProps = getInputProps() as {
    background?: { type: "color" | "image"; value: string };
    duration?: number;
    trackItemsMap?: Record<string, RenderTrackItem>;
    transitionsMap?: Record<string, RenderTransition>;
    tracks?: RenderTrack[];
  };

  return (
    <ExportPlayer
      tracks={inputProps.tracks ?? []}
      trackItemsMap={inputProps.trackItemsMap ?? {}}
      transitionsMap={inputProps.transitionsMap ?? {}}
      duration={inputProps.duration ?? 1000}
      background={inputProps.background ?? { type: "color", value: "#000000" }}
    />
  );
}
