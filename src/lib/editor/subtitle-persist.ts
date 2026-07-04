import type { SubtitleCue, SubtitleStyle } from "@/lib/subtitles/types";
import type { ICaption, ITrackItem } from "@designcombo/types";
import { cuesFromWordsOnly } from "@/lib/subtitles/cues";

export function captionItemsToCues(
  trackItemsMap: Record<string, ITrackItem>
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const item of Object.values(trackItemsMap)) {
    if (item.type !== "caption") continue;
    const cap = item as ICaption;
    const words =
      cap.details?.words?.map((w) => ({
        word: w.word,
        startMs: Math.round(w.start + cap.display.from),
        endMs: Math.round(w.end + cap.display.from),
      })) ?? [];
    cues.push({
      id: (cap.metadata?.cueId as string) ?? cap.id,
      startMs: cap.display.from,
      endMs: cap.display.to,
      text: cap.details?.text ?? "",
      words,
    });
  }

  // If there's only 1 giant cue in the editor, re-split it into short timed captions.
  if (cues.length === 1 && cues[0].words && cues[0].words.length > 0) {
    return cuesFromWordsOnly(
      cues[0].words.map((w) => ({ word: w.word, start: w.startMs / 1000, end: w.endMs / 1000 })),
      54
    );
  }
  
  return cues.sort((a, b) => a.startMs - b.startMs);
}

export async function saveProjectSubtitles(
  projectId: string,
  cues: SubtitleCue[],
  style: SubtitleStyle,
  stylePreset = "instagram_reels"
): Promise<void> {
  if (cues.length === 0) return;
  await fetch(`/api/projects/${projectId}/subtitles`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cues,
      stylePreset,
      customStyle: style,
      isBurntIn: true,
    }),
  });
}
