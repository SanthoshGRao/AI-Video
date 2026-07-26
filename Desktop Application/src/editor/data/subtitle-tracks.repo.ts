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
