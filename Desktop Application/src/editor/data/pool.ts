/**
 * pool.ts — direct `pg` connection to the local Postgres database used by
 * the native editor. No Prisma, no HTTP layer, no dependency on the
 * Next.js server process — just a plain connection pool to the same
 * database the embedded-postgres instance (or user-supplied DATABASE_URL)
 * already serves at 127.0.0.1:5435.
 */

import { Pool } from "pg";
import { loadConfig } from "../../config";
import { embeddedConnectionString } from "../../postgres";

let pool: Pool | null = null;

/** Lazily create (or return) the shared connection pool. */
export function getPool(): Pool {
  if (pool) return pool;

  const config = loadConfig();
  const connectionString = config.databaseUrl?.trim() || embeddedConnectionString();

  pool = new Pool({
    connectionString,
    max: 5,
  });

  return pool;
}

/** Closed on app quit alongside the embedded Postgres server. */
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
