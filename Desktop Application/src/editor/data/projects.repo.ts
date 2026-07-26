import { getPool } from "./pool";
import type { ProjectRow } from "./types";

export async function getProject(id: string): Promise<ProjectRow | null> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", title, status, language, "durationSeconds", "updatedAt"
     FROM projects WHERE id = $1 LIMIT 1`,
    [id]
  );
  return (rows[0] as ProjectRow) ?? null;
}
