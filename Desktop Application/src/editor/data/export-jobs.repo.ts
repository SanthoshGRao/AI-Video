import { getPool } from "./pool";
import { newId } from "./ids";
import type { ExportJobRow } from "./types";

const COLUMNS = `id, "projectId", status, format, "aspectRatio", resolution, "subtitleBurnIn", watermark,
  "downloadUrl", "fileSizeBytes", "renderProgress", "errorMessage", "startedAt", "completedAt", "createdAt"`;

export interface CreateExportJobInput {
  projectId: string;
  format: string;
  aspectRatio: string;
  resolution: string;
  subtitleBurnIn: boolean;
}

export async function createExportJob(input: CreateExportJobInput): Promise<ExportJobRow> {
  const { rows } = await getPool().query(
    `INSERT INTO export_jobs (id, "projectId", status, format, "aspectRatio", resolution, "subtitleBurnIn", watermark, "renderProgress", "createdAt", "startedAt")
     VALUES ($1, $2, 'RENDERING', $3, $4, $5, $6, false, 0, now(), now())
     RETURNING ${COLUMNS}`,
    [newId(), input.projectId, input.format, input.aspectRatio, input.resolution, input.subtitleBurnIn]
  );
  return rows[0] as ExportJobRow;
}

export async function updateExportProgress(id: string, progress: number): Promise<void> {
  await getPool().query(`UPDATE export_jobs SET "renderProgress" = $2 WHERE id = $1`, [
    id,
    Math.max(0, Math.min(100, Math.round(progress))),
  ]);
}

export async function completeExportJob(
  id: string,
  downloadUrl: string,
  fileSizeBytes: number
): Promise<void> {
  await getPool().query(
    `UPDATE export_jobs
     SET status = 'DONE', "renderProgress" = 100, "downloadUrl" = $2, "fileSizeBytes" = $3, "completedAt" = now()
     WHERE id = $1`,
    [id, downloadUrl, fileSizeBytes]
  );
}

export async function failExportJob(id: string, errorMessage: string): Promise<void> {
  await getPool().query(
    `UPDATE export_jobs SET status = 'FAILED', "errorMessage" = $2, "completedAt" = now() WHERE id = $1`,
    [id, errorMessage.slice(0, 2000)]
  );
}

export async function getExportJob(id: string): Promise<ExportJobRow | null> {
  const { rows } = await getPool().query(`SELECT ${COLUMNS} FROM export_jobs WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as ExportJobRow) ?? null;
}
