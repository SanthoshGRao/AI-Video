"use client";

import { Film, Image as ImageIcon, Music, Type, Subtitles } from "lucide-react";
import useStore from "../store/use-store";
import type { ITrack } from "@designcombo/types";

const TRACK_HEIGHT: Record<string, number> = {
  caption: 32,
  text: 32,
  audio: 36,
  video: 48,
  image: 48,
  helper: 28,
  template: 40,
  customTrack: 40,
  customTrack2: 40,
};

const TRACK_ICON: Record<string, typeof Film> = {
  video: Film,
  image: ImageIcon,
  audio: Music,
  text: Type,
  caption: Subtitles,
};

function trackHeight(track: ITrack): number {
  const firstId = track.items[0];
  return TRACK_HEIGHT[track.type] ?? 40;
}

export function TimelineTrackLabels({
  height,
  offsetX,
}: {
  height: number;
  offsetX: number;
}) {
  const tracks = useStore((s) => s.tracks);

  if (!tracks.length) return null;

  let y = 0;
  const rows = tracks.map((track) => {
    const h = trackHeight(track);
    const row = { track, top: y, height: h };
    y += h;
    return row;
  });

  return (
    <div
      className="relative shrink-0 border-r border-border/60 bg-muted/30"
      style={{ width: offsetX, height }}
    >
      {rows.map(({ track, top, height: h }) => {
        const Icon = TRACK_ICON[track.type] ?? Film;
        const label =
          track.type === "caption"
            ? "Captions"
            : (track.type as string) === "subtitle"
              ? "Subtitles"
              : track.type === "audio"
                ? "Audio"
                : (track.type as string) === "voiceover"
                  ? "Voiceover"
                  : track.type === "text"
                    ? "Titles"
                    : track.type === "video"
                      ? "Video"
                      : track.type;
        return (
          <div
            key={track.id}
            className="absolute left-0 right-0 flex items-center gap-1.5 border-b border-border/40 px-2 text-[10px] font-medium text-muted-foreground"
            style={{ top, height: h }}
          >
            <Icon className="h-3 w-3 shrink-0 opacity-70" />
            <span className="truncate">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
