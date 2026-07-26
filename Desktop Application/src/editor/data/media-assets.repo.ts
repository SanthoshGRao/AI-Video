import { getPool } from "./pool";
import type { MediaAssetRow } from "./types";

const COLUMNS = `id, "projectId", "userId", type, "originalName", "localPath", width, height, "durationMs", "mimeType"`;

export async function listMediaAssetsForProject(projectId: string): Promise<MediaAssetRow[]> {
  const { rows } = await getPool().query(
    `SELECT ${COLUMNS} FROM media_assets WHERE "projectId" = $1 ORDER BY "createdAt" ASC`,
    [projectId]
  );
  return rows as MediaAssetRow[];
}

export async function getMediaAssetsByIds(ids: string[]): Promise<MediaAssetRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await getPool().query(
    `SELECT ${COLUMNS} FROM media_assets WHERE id = ANY($1::text[])`,
    [ids]
  );
  return rows as MediaAssetRow[];
}

export async function getMediaAsset(id: string): Promise<MediaAssetRow | null> {
  const { rows } = await getPool().query(`SELECT ${COLUMNS} FROM media_assets WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as MediaAssetRow) ?? null;
}
