import { parseTimelineRow } from "@/lib/timeline/parse";
import type { TimelineRecord } from "@/lib/timeline/types";

export function serializeTimeline(row: {
  id: string;
  projectId: string;
  version: number;
  tracks: unknown;
  clips: unknown;
  transitions: unknown | null;
  textLayers: unknown | null;
  settings: unknown | null;
  isAutosave: boolean;
  isAiGenerated: boolean;
  createdAt: Date;
}): TimelineRecord {
  const doc = parseTimelineRow({
    tracks: row.tracks,
    clips: row.clips,
    transitions: row.transitions,
    textLayers: row.textLayers,
    settings: row.settings,
  });

  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    ...doc,
    isAutosave: row.isAutosave,
    isAiGenerated: row.isAiGenerated,
    createdAt: row.createdAt.toISOString(),
  };
}
