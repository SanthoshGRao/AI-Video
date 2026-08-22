-- ---------------------------------------------------------------------------
-- v1.1.8 — project export/import and workspace collaboration.
--
-- Adds the advisory editing lock that keeps two workspace members from silently
-- overwriting each other's timeline. Everything else in 1.1.8 (bundle export and
-- import, workspace-scoped projects) runs on the tables v1.1.7 already created,
-- so this is the only schema change.
--
-- Apply to any Postgres the app points at (Settings → Database URL) that was
-- created before v1.1.8. The desktop app performs the same work on launch;
-- running it directly is useful for a shared/remote server that several installs
-- connect to, where one run fixes every client at once.
--
-- Every statement is guarded, so this is safe to run more than once. It only
-- adds things — no column is dropped and no row is modified.
--
--   psql "postgresql://USER:PASSWORD@HOST:5432/DBNAME" \
--     -f manual_v118_project_locks.sql
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TABLE IF NOT EXISTS "project_locks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_locks_pkey" PRIMARY KEY ("id")
);

-- One lock per project is the whole point: the unique index is what makes two
-- people racing for a free lock resolve to a single winner.
CREATE UNIQUE INDEX IF NOT EXISTS "project_locks_projectId_key" ON "project_locks"("projectId");
CREATE INDEX IF NOT EXISTS "project_locks_heartbeatAt_idx" ON "project_locks"("heartbeatAt");

DO $$ BEGIN ALTER TABLE "project_locks" ADD CONSTRAINT "project_locks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "project_locks" ADD CONSTRAINT "project_locks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
