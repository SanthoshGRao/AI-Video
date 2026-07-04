export type SubtitleWord = {
  word: string;
  startMs: number;
  endMs: number;
};

export type SubtitleCue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words: SubtitleWord[];
};

export type SubtitleStyle = {
  fontFamily: string;
  fontStyle?: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  position: "top" | "center" | "bottom";
  animation: "none" | "fade" | "word_pop" | "highlight" | "karaoke";
  highlightColor: string;
  stroke: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
};

export type SubtitleTrackPayload = {
  id: string;
  projectId: string;
  audioAssetId: string | null;
  language: string;
  cues: SubtitleCue[];
  stylePreset: string;
  customStyle: SubtitleStyle | null;
  isBurntIn: boolean;
};
