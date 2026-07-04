/**
 * IndexedDB persistence (Dexie). Caches project bundles, timelines,
 * thumbnails, and waveform peaks so reloading the editor is instant
 * and works offline.
 */
import Dexie, { type Table } from "dexie";
import type { ProjectBundle, ID } from "./contract";
import type { Timeline } from "./schema";

export interface BundleRow {
  projectId: ID;
  bundle: ProjectBundle;
}
export interface TimelineRow {
  projectId: ID;
  timeline: Timeline;
  updatedAt: string;
}
export interface ThumbRow {
  key: string; // `${assetId}:${seconds}`
  dataUrl: string;
}
export interface WaveformRow {
  assetId: ID;
  peaks: number[];
}

class EditorDB extends Dexie {
  bundles!: Table<BundleRow, ID>;
  timelines!: Table<TimelineRow, ID>;
  thumbs!: Table<ThumbRow, string>;
  waveforms!: Table<WaveformRow, ID>;

  constructor() {
    super("lovable-editor");
    this.version(1).stores({
      bundles: "projectId",
      timelines: "projectId, updatedAt",
      thumbs: "key",
      waveforms: "assetId",
    });
  }
}

export const db = new EditorDB();
