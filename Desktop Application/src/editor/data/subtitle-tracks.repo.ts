import { getPool } from "./pool";
import type { SubtitleTrackRow } from "./types";

const COLUMNS = `id, "projectId", "audioAssetId", language, cues, "stylePreset", "customStyle"`;

export async function listSubtitleTracksForProject(projectId: string): Promise<SubtitleTrackRow[]> {
  const { rows } = await getPool().query(
    `SELECT ${COLUMNS} FROM subtitle_tracks WHERE "projectId" = $1 ORDER BY "createdAt" ASC`,
    [projectId]
  );
  return rows as SubtitleTrackRow[];
}

export async function getSubtitleTrack(id: string): Promise<SubtitleTrackRow | null> {
  const { rows } = await getPool().query(`SELECT ${COLUMNS} FROM subtitle_tracks WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as SubtitleTrackRow) ?? null;
}

/** Persists edited cue text/timing back to the track's `cues` JSON — the
 * editor's subtitle clips are the editable surface, but export's ASS
 * burn-in reads `cues` directly, so an edit has to land here to actually
 * appear in the exported video. See model/subtitle-sync.ts. */
export async function updateSubtitleTrackCues(id: string, cues: unknown): Promise<void> {
  await getPool().query(`UPDATE subtitle_tracks SET cues = $2 WHERE id = $1`, [id, JSON.stringify(cues)]);
}
