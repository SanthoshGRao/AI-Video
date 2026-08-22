-- ---------------------------------------------------------------------------
-- v1.1.7 — bring a pre-1.1.7 database up to the current Prisma schema.
--
-- Apply this to any Postgres the app points at (Settings → Database URL) that
-- was created before v1.1.7. The desktop app performs the same work on launch,
-- but running it directly is useful for a shared/remote server that several
-- installs connect to: one run fixes every client at once.
--
-- Every statement is guarded, so this is safe to run more than once. It only
-- adds things — no column is dropped and no row is modified.
--
--   psql "postgresql://USER:PASSWORD@HOST:5432/DBNAME" \
--     -f manual_v117_workspaces_and_auth_columns.sql
-- ---------------------------------------------------------------------------

BEGIN;

-- Enum backing WorkspaceMember.role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceRole') THEN
    CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
  END IF;
END $$;

-- Columns every account lookup selects. Their absence is what produced
-- "The column users.passwordHash does not exist in the current database".
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "licenseKey"   TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "workspaceId"  TEXT;

CREATE TABLE IF NOT EXISTS "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workspaceKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "workspace_members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_licenseKey_key" ON "users"("licenseKey");
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_workspaceKey_key" ON "workspaces"("workspaceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "projects_workspaceId_idx" ON "projects"("workspaceId");
CREATE INDEX IF NOT EXISTS "workspaces_ownerId_idx" ON "workspaces"("ownerId");
CREATE INDEX IF NOT EXISTS "workspace_members_userId_idx" ON "workspace_members"("userId");
CREATE INDEX IF NOT EXISTS "workspace_members_workspaceId_idx" ON "workspace_members"("workspaceId");

DO $$ BEGIN ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
