import { getPool } from "./pool";
import type { UserRow } from "./types";

export async function getUserByGoogleId(googleId: string): Promise<UserRow | null> {
  const { rows } = await getPool().query(
    `SELECT id, "googleId", email, name FROM users WHERE "googleId" = $1 LIMIT 1`,
    [googleId]
  );
  return (rows[0] as UserRow) ?? null;
}
