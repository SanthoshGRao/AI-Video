/**
 * timelines.repo.ts — Timeline row read/write.
 *
 * Save semantics mirror Web Application's PUT /api/projects/[id]/timeline
 * (see Web Application/src/app/api/projects/[id]/timeline/route.ts and the
 * "editor-v2-persistence" lesson: the server Timeline row is authoritative
 * — never overwrite blindly, and races are resolved with a SERIALIZABLE
 * transaction rather than trusting a stale in-memory "latest version"):
 * autosaves and non-version-bumping saves update the latest row in place;
 * an explicit version bump (or no existing row) inserts a new row.
 */

import { getPool } from "./pool";
import { newId } from "./ids";
import type { TimelineRowDb } from "./types";

export async function getLatestTimeline(projectId: string): Promise<TimelineRowDb | null> {
  const { rows } = await getPool().query(
    `SELECT id, "projectId", version, tracks, clips, transitions, "textLayers", settings,
            "isAutosave", "isAiGenerated", "createdAt"
     FROM timelines
     WHERE "projectId" = $1
     ORDER BY version DESC, "createdAt" DESC
     LIMIT 1`,
    [projectId]
  );
  return (rows[0] as TimelineRowDb) ?? null;
}

export interface SaveTimelinePayload {
  tracks: unknown;
  clips: unknown;
  transitions: unknown;
  textLayers: unknown;
  settings: unknown;
  isAutosave: boolean;
  bumpVersion: boolean;
}

export async function saveTimeline(
  projectId: string,
  payload: SaveTimelinePayload
): Promise<TimelineRowDb> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    const { rows: existingRows } = await client.query(
      `SELECT id, version, "isAutosave" FROM timelines
       WHERE "projectId" = $1
       ORDER BY version DESC, "createdAt" DESC
       LIMIT 1
       FOR UPDATE`,
      [projectId]
    );
    const existing = existingRows[0] as { id: string; version: number; isAutosave: boolean } | undefined;

    let row: TimelineRowDb;

    const updateInPlace =
      existing &&
      !payload.bumpVersion &&
      (payload.isAutosave ? existing.isAutosave : true);

    if (updateInPlace && existing) {
      const { rows } = await client.query(
        `UPDATE timelines
         SET tracks = $2, clips = $3, transitions = $4, "textLayers" = $5, settings = $6, "isAutosave" = $7
         WHERE id = $1
         RETURNING id, "projectId", version, tracks, clips, transitions, "textLayers", settings,
                   "isAutosave", "isAiGenerated", "createdAt"`,
        [
          existing.id,
          JSON.stringify(payload.tracks),
          JSON.stringify(payload.clips),
          JSON.stringify(payload.transitions),
          JSON.stringify(payload.textLayers),
          JSON.stringify(payload.settings),
          payload.isAutosave,
        ]
      );
      row = rows[0] as TimelineRowDb;
    } else {
      const nextVersion = (existing?.version ?? 0) + 1;
      const { rows } = await client.query(
        `INSERT INTO timelines (id, "projectId", version, tracks, clips, transitions, "textLayers", settings, "isAutosave", "isAiGenerated", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, now())
         RETURNING id, "projectId", version, tracks, clips, transitions, "textLayers", settings,
                   "isAutosave", "isAiGenerated", "createdAt"`,
        [
          newId(),
          projectId,
          nextVersion,
          JSON.stringify(payload.tracks),
          JSON.stringify(payload.clips),
          JSON.stringify(payload.transitions),
          JSON.stringify(payload.textLayers),
          JSON.stringify(payload.settings),
          payload.isAutosave,
        ]
      );
      row = rows[0] as TimelineRowDb;
    }

    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
