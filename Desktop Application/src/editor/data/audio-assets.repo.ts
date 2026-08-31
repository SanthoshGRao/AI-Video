import { getPool } from "./pool";
import type { AudioAssetRow } from "./types";

const COLUMNS = `id, "projectId", "voiceType", "localPath", "r2Url", "durationMs", "waveformData", "wordTimestamps"`;

export async function listAudioAssetsForProject(projectId: string): Promise<AudioAssetRow[]> {
  const { rows } = await getPool().query(
    `SELECT ${COLUMNS} FROM audio_assets WHERE "projectId" = $1 ORDER BY "createdAt" ASC`,
    [projectId]
  );
  return rows as AudioAssetRow[];
}

export async function getAudioAsset(id: string): Promise<AudioAssetRow | null> {
  const { rows } = await getPool().query(`SELECT ${COLUMNS} FROM audio_assets WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as AudioAssetRow) ?? null;
}

export async function getAudioAssetsByIds(ids: string[]): Promise<AudioAssetRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await getPool().query(
    `SELECT ${COLUMNS} FROM audio_assets WHERE id = ANY($1::text[])`,
    [ids]
  );
  return rows as AudioAssetRow[];
}
