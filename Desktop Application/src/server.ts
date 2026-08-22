/**
 * server.ts — Next.js server child-process manager.
 *
 * Spawns the web application's Next.js server and health-polls it
 * until it's ready to accept connections.
 *
 * Two modes:
 *   1. Standalone — `node .next/standalone/server.js` (if the web app
 *      was built with `output: "standalone"` in next.config.ts).
 *   2. Full — `node node_modules/next/dist/bin/next start` using the
 *      installed next binary.  Works without any web-app changes.
 *
 * Standalone is preferred for production packaging (smaller bundle),
 * but Full mode works out of the box for development.
 */

import { spawn, type ChildProcess } from "child_process";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";

let serverProcess: ChildProcess | null = null;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface ServerOpts {
  /** Absolute path to the Web Application directory. */
  webAppDir: string;
  /** Port to start the server on. */
  port: number;
  /** Environment variables to inject. */
  env: Record<string, string>;
  /** Optional callback for stdout/stderr lines. */
  onLog?: (line: string) => void;
}

export interface SchemaPushOpts {
  /**
   * True when `env.DATABASE_URL` points at the Postgres instance this app
   * started itself. Only then is it safe to clear other sessions — a
   * user-supplied DATABASE_URL may be a shared server whose other
   * connections belong to someone else.
   */
  embedded?: boolean;
}

/**
 * Execute the full database schema directly via the `pg` module.
 * This bypasses the prisma CLI entirely — no need for prisma.cmd,
 * tsx, node shims, or prisma.config.ts. The raw SQL was generated
 * from `prisma migrate diff --from-empty --to-schema ...` and each
 * statement uses IF NOT EXISTS / DO $$ guards so it's safe to run
 * on every launch (idempotent).
 *
 * Runs in ordered passes, each isolated from the next:
 *
 *   1. DDL_TABLES_SQL — creates enums and tables.
 *   2. Derived ALTERs — brings a database created by an OLDER version up
 *      to date. `CREATE TABLE IF NOT EXISTS` is a no-op on an existing
 *      table, so columns and enum values added since that table was first
 *      created would otherwise never appear, and every query touching them
 *      would fail for anyone upgrading rather than installing fresh.
 *   3. DDL_CONSTRAINTS_SQL — indexes and foreign keys. These run AFTER
 *      pass 2 on purpose: an index or FK on a column that pass 2 has just
 *      added can only be created once the column exists. Running them in
 *      pass 1 would raise `undefined_column` on every upgrading install —
 *      and because pass 1 is a single implicit transaction, that one error
 *      would roll the whole schema back.
 *   4. SEED_SQL — optional reference rows (see seedDatabase).
 *
 * Statements in passes 2 and 3 are sent one at a time so a single failure
 * can't
 * take the rest down with it. That isolation is the whole point: pg runs
 * a multi-statement query as one implicit transaction, so when these were
 * concatenated into a single string, one malformed seed row at the very
 * end rolled back the entire schema and left the database empty.
 */
export async function pushSchema(
  _webAppDir: string,
  env: Record<string, string>,
  opts: SchemaPushOpts = {}
): Promise<void> {
  const dbUrl = env.DIRECT_URL || env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[server] No DATABASE_URL — skipping schema push.");
    return;
  }

  // Dynamic require so we don't need pg in devDependencies of the
  // Desktop Application — it's already bundled via the Web Application's
  // node_modules which are in extraResources.
  let Client: any;
  try {
    Client = require("pg").Client;
  } catch {
    console.warn("[server] pg module not found — skipping schema push.");
    return;
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();

    if (opts.embedded) {
      await clearStaleSessions(client);
    }

    // Fail fast rather than hang. Every statement below takes a lock, and a
    // conflicting one is held indefinitely by a leftover backend from a run
    // that didn't shut down cleanly. Without a lock_timeout the boot simply
    // stops on "Syncing database schema…" with nothing to show the user;
    // with one, the statement gives up and the error reaches the splash.
    await client.query("SET lock_timeout = '5s'");
    await client.query("SET statement_timeout = '300s'");

    // ...but a per-statement timeout alone isn't enough: there are several
    // hundred statements, so a table that stays locked would still take
    // hours to grind through at 5s each. One probe up front turns that into
    // one 5s wait and a message that names the problem.
    await assertSchemaLockable(client);

    console.log("[server] Syncing database schema via raw SQL…");
    await client.query(DDL_TABLES_SQL);

    const migrations = [
      ...enumValueAlters(DDL_TABLES_SQL),
      ...addColumnAlters(DDL_TABLES_SQL),
    ];
    const applied = await runIndependently(client, migrations);
    if (applied) {
      console.log(`[server] Applied ${applied} schema migration(s).`);
    }

    await runIndependently(client, splitStatements(DDL_CONSTRAINTS_SQL));

    console.log("[server] Database schema synced successfully.");
  } catch (err: any) {
    console.error("[server] Schema push via SQL failed:", err?.message);
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Insert the reference rows (property templates + prompt chips) the
 * project-creation UI lists. Every statement is `ON CONFLICT DO NOTHING`,
 * so this is safe to re-run on every launch — which also means a database
 * seeded by a broken earlier build gets topped up rather than staying
 * half-populated forever.
 *
 * Non-fatal by design: templates are reference data, not something the
 * app can't open without.
 */
export async function seedDatabase(
  _webAppDir: string,
  env: Record<string, string>
): Promise<void> {
  const dbUrl = env.DIRECT_URL || env.DATABASE_URL;
  if (!dbUrl) return;

  let Client: any;
  try {
    Client = require("pg").Client;
  } catch {
    return;
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    await client.query("SET lock_timeout = '15s'").catch(() => {});
    const inserted = await runIndependently(client, SEED_SQL);
    console.log(`[server] Seeded ${inserted}/${SEED_SQL.length} reference table(s).`);
  } finally {
    await client.end().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/*  Schema helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Check that the schema is actually writable before attempting hundreds of
 * DDL statements against it.
 *
 * If something else holds a conflicting lock on a core table, every one of
 * those statements would wait out the full lock_timeout — hours in total,
 * with the splash stuck on "Syncing database schema…" the whole time. This
 * takes the same lock once and gives up after 5s, so the boot fails in
 * seconds with an error that says what's wrong.
 *
 * Skipped on a database that has no tables yet: there's nothing to lock,
 * and a first run must not be blocked by this.
 */
async function assertSchemaLockable(client: any): Promise<void> {
  const { rows } = await client.query(
    `SELECT to_regclass('public.users') IS NOT NULL AS present`
  );
  if (!rows[0]?.present) return; // fresh database — nothing to conflict with

  try {
    await client.query("BEGIN");
    await client.query('LOCK TABLE "users" IN ACCESS EXCLUSIVE MODE');
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    if (err?.code === "55P03") {
      throw new Error(
        "Database is locked by another process — the schema could not be " +
          "updated. Close any other copy of Video Studio (or restart your " +
          "computer to clear a leftover database process) and try again."
      );
    }
    throw err;
  }
  await client.query("ROLLBACK");
}

/**
 * Terminate any other backend connected to our database.
 *
 * At boot nothing legitimate is connected yet — the Next.js server hasn't
 * been spawned — so any other session on the embedded server is a leftover
 * from a previous run whose Postgres was orphaned instead of stopped. Those
 * leftovers matter because one killed mid-DDL stays "idle in transaction"
 * holding an ACCESS EXCLUSIVE lock, and the postmaster won't notice its
 * client is gone for as long as the OS keeps the dead TCP connection alive
 * (hours, on Windows defaults). Everything the app does afterwards — the
 * schema push, and then every query the UI makes — blocks behind that lock.
 *
 * Caller must ensure this is the embedded server; see SchemaPushOpts.
 */
async function clearStaleSessions(client: any): Promise<void> {
  try {
    const { rows } = await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()`
    );
    if (rows.length > 0) {
      console.log(
        `[server] Cleared ${rows.length} stale database session(s) left by a previous run.`
      );
    }
  } catch (err: any) {
    // Not fatal on its own — the lock_timeout below will surface the
    // consequence with a clearer message if a leftover really is in the way.
    console.warn("[server] Could not clear stale sessions:", err?.message);
  }
}

/**
 * Run each statement in its own round trip, logging but swallowing
 * failures. Returns how many succeeded.
 */
async function runIndependently(client: any, statements: string[]): Promise<number> {
  let ok = 0;
  let consecutiveLockTimeouts = 0;

  for (const sql of statements) {
    try {
      await client.query(sql);
      ok++;
      consecutiveLockTimeouts = 0;
    } catch (err: any) {
      console.warn(`[server] Skipped statement (${err?.message}): ${sql.slice(0, 120)}`);

      // 55P03 = lock_not_available. A run of these means something is
      // holding the table and the remaining statements will each burn the
      // full lock_timeout for nothing — give the pass up instead.
      if (err?.code === "55P03") {
        if (++consecutiveLockTimeouts >= 3) {
          console.warn(
            "[server] Abandoning pass — database is locked by another process."
          );
          break;
        }
      } else {
        consecutiveLockTimeouts = 0;
      }
    }
  }
  return ok;
}

/**
 * Split a SQL script into individual statements.
 *
 * `$$ … $$` dollar-quoted bodies are treated as opaque, so the semicolons
 * inside a `DO $$ ... END $$` block aren't mistaken for statement
 * terminators. Whole-line `--` comments are dropped so a failing statement
 * logs as itself rather than as the comment above it.
 */
function splitStatements(sql: string): string[] {
  const body = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const out: string[] = [];
  let buf = "";
  let inDollarQuote = false;

  for (let i = 0; i < body.length; i++) {
    if (body[i] === "$" && body[i + 1] === "$") {
      inDollarQuote = !inDollarQuote;
      buf += "$$";
      i++;
      continue;
    }
    if (body[i] === ";" && !inDollarQuote) {
      const stmt = buf.trim();
      if (stmt) out.push(`${stmt};`);
      buf = "";
      continue;
    }
    buf += body[i];
  }

  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * `ALTER TYPE ... ADD VALUE IF NOT EXISTS` for every enum value in the
 * DDL, so enum members added after a user's database was created still
 * get registered. Cheap no-op when they're already there.
 */
function enumValueAlters(ddl: string): string[] {
  const out: string[] = [];
  const typeRe = /CREATE TYPE "(\w+)" AS ENUM \(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = typeRe.exec(ddl))) {
    const [, typeName, values] = match;
    for (const raw of values.split(",")) {
      const value = raw.trim().replace(/^'|'$/g, "");
      if (value) {
        out.push(`ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS '${value}';`);
      }
    }
  }
  return out;
}

/**
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for every column in the DDL,
 * derived from the same CREATE TABLE text so there's only one place to
 * keep up to date when the Prisma schema gains a field.
 *
 * NOT NULL is dropped for columns that have no DEFAULT: Postgres rejects
 * adding one of those to a table that already holds rows, and half a
 * migration is worse than a nullable column.
 */
function addColumnAlters(ddl: string): string[] {
  const out: string[] = [];
  const tableRe = /CREATE TABLE IF NOT EXISTS "(\w+)" \(([\s\S]*?)\n\);/g;
  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(ddl))) {
    const [, table, body] = match;
    if (table === "_prisma_migrations") continue;
    for (const raw of body.split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      const column = line.match(/^"(\w+)"\s+(.+)$/);
      if (!column) continue; // CONSTRAINT lines and blanks
      const [, name, rawType] = column;
      const type = /DEFAULT/i.test(rawType)
        ? rawType
        : rawType.replace(/\s*NOT NULL\s*/i, " ").trim();
      out.push(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${name}" ${type};`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Full schema DDL (idempotent — safe to run on every launch)         */
/* ------------------------------------------------------------------ */

const DDL_TABLES_SQL = `
-- Enums (CREATE TYPE ... IF NOT EXISTS is PG 9.1+ via DO block)
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Plan') THEN CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChipCategory') THEN CREATE TYPE "ChipCategory" AS ENUM ('TONE', 'AUDIENCE', 'STYLE', 'FEATURE'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectStatus') THEN CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'CONTENT_READY', 'MEDIA_UPLOADED', 'EDITING', 'RENDERING', 'EXPORTED', 'ARCHIVED'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MediaType') THEN CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'DRONE', 'LOGO', 'DOCUMENT'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExportStatus') THEN CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'RENDERING', 'POST_PROCESSING', 'UPLOADING', 'DONE', 'FAILED'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SocialPlatform') THEN CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'YOUTUBE', 'TELEGRAM'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceRole') THEN CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'); END IF; END $$;

-- Tables
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT,
    "googleId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "licenseKey" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "creditsLimit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brand_kits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "logoUrl" TEXT,
    "logoR2Key" TEXT,
    "watermarkUrl" TEXT,
    "watermarkR2Key" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0F172A',
    "secondaryColor" TEXT NOT NULL DEFAULT '#6366F1',
    "accentColor" TEXT NOT NULL DEFAULT '#F59E0B',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "phoneNumber" TEXT,
    "whatsappNumber" TEXT,
    "ctaFooter" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brand_kits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "property_templates" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "focusAreas" TEXT[],
    "aiSystemPrompt" TEXT NOT NULL,
    "scriptStrategy" TEXT NOT NULL,
    "socialFormat" TEXT NOT NULL,
    "ctaStyle" TEXT NOT NULL,
    "hashtagStrategy" TEXT NOT NULL,
    "sampleInput" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "property_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "prompt_chips" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "category" "ChipCategory" NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prompt_chips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "propertyData" JSONB,
    "extractedFacts" JSONB,
    "validatedFacts" JSONB,
    "targetAudience" TEXT,
    "language" TEXT NOT NULL DEFAULT 'kannada_english',
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "ctaStyle" TEXT NOT NULL DEFAULT 'standard',
    "durationSeconds" INTEGER NOT NULL DEFAULT 60,
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "script_versions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "generationBatch" INTEGER NOT NULL DEFAULT 1,
    "versionNumber" INTEGER NOT NULL,
    "variationStyle" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'kannada_english',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedDuration" INTEGER NOT NULL DEFAULT 0,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "factCheckPassed" BOOLEAN NOT NULL DEFAULT false,
    "factCheckReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "script_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audio_assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scriptVersionId" TEXT,
    "voiceType" TEXT NOT NULL,
    "voiceStyleLabel" TEXT,
    "localPath" TEXT,
    "r2Key" TEXT NOT NULL,
    "r2Url" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "waveformData" JSONB,
    "wordTimestamps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audio_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "media_folders" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "parentFolderId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "media_assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "mediaFolderId" TEXT,
    "type" "MediaType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "localPath" TEXT,
    "r2Key" TEXT NOT NULL,
    "r2Url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "thumbnailR2Key" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "fileSizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "media_tags" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "content_packs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "instagramCaptions" JSONB,
    "facebookCopies" JSONB,
    "whatsappCopies" JSONB,
    "telegramCopy" JSONB,
    "youtubeDescriptions" JSONB,
    "ctaVariations" JSONB,
    "hashtagSets" JSONB,
    "seoMetadata" JSONB,
    "propertyHighlights" JSONB,
    "googleBusinessPost" JSONB,
    "selectedPlatforms" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_packs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "timelines" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "tracks" JSONB NOT NULL,
    "clips" JSONB NOT NULL,
    "transitions" JSONB,
    "textLayers" JSONB,
    "settings" JSONB,
    "isAutosave" BOOLEAN NOT NULL DEFAULT false,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "timelines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subtitle_tracks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "audioAssetId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'kannada_english',
    "cues" JSONB NOT NULL,
    "stylePreset" TEXT NOT NULL DEFAULT 'instagram_reels',
    "customStyle" JSONB,
    "isBurntIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subtitle_tracks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "export_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "format" TEXT NOT NULL DEFAULT 'mp4',
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "resolution" TEXT NOT NULL DEFAULT '1080p',
    "subtitleBurnIn" BOOLEAN NOT NULL DEFAULT true,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "r2Key" TEXT,
    "downloadUrl" TEXT,
    "fileSizeBytes" INTEGER,
    "renderProgress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "render_jobs" (
    "id" TEXT NOT NULL,
    "exportJobId" TEXT NOT NULL,
    "bullmqJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "logs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recovery_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'autosave',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recovery_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "analytics_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "custom_fonts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'file',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "custom_fonts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "font_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "font_usage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "voice_style_presets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "geminiVoice" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "styleId" TEXT,
    "styleInstructions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voice_style_presets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "character_bundles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "characters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "character_bundles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tts_preview_samples" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "voiceName" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "styleId" TEXT,
    "mimeType" TEXT NOT NULL,
    "audio" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tts_preview_samples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "connected_social_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "accountName" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "connected_social_accounts_pkey" PRIMARY KEY ("id")
);

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

-- Prisma migrations metadata table (so Prisma Client doesn't complain)
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);
`;

/* ------------------------------------------------------------------ */
/*  Indexes + foreign keys (applied after the ADD COLUMN pass, so a    */
/*  constraint on a newly-added column can actually be created)        */
/* ------------------------------------------------------------------ */

const DDL_CONSTRAINTS_SQL = `
-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "users_clerkId_key" ON "users"("clerkId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_googleId_key" ON "users"("googleId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_licenseKey_key" ON "users"("licenseKey");
CREATE UNIQUE INDEX IF NOT EXISTS "brand_kits_userId_key" ON "brand_kits"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "property_templates_slug_key" ON "property_templates"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "render_jobs_exportJobId_key" ON "render_jobs"("exportJobId");
CREATE UNIQUE INDEX IF NOT EXISTS "custom_fonts_userId_family_key" ON "custom_fonts"("userId", "family");
CREATE UNIQUE INDEX IF NOT EXISTS "font_usage_userId_family_key" ON "font_usage"("userId", "family");
CREATE UNIQUE INDEX IF NOT EXISTS "voice_style_presets_userId_name_key" ON "voice_style_presets"("userId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "character_bundles_userId_name_key" ON "character_bundles"("userId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "tts_preview_samples_cacheKey_key" ON "tts_preview_samples"("cacheKey");
CREATE UNIQUE INDEX IF NOT EXISTS "connected_social_accounts_userId_platform_key" ON "connected_social_accounts"("userId", "platform");
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_workspaceKey_key" ON "workspaces"("workspaceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");

-- Non-unique indexes
CREATE INDEX IF NOT EXISTS "projects_userId_idx" ON "projects"("userId");
CREATE INDEX IF NOT EXISTS "projects_workspaceId_idx" ON "projects"("workspaceId");
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects"("status");
CREATE INDEX IF NOT EXISTS "script_versions_projectId_idx" ON "script_versions"("projectId");
CREATE INDEX IF NOT EXISTS "script_versions_projectId_generationBatch_idx" ON "script_versions"("projectId", "generationBatch");
CREATE INDEX IF NOT EXISTS "audio_assets_projectId_idx" ON "audio_assets"("projectId");
CREATE INDEX IF NOT EXISTS "media_folders_userId_projectId_parentFolderId_idx" ON "media_folders"("userId", "projectId", "parentFolderId");
CREATE INDEX IF NOT EXISTS "media_folders_parentFolderId_idx" ON "media_folders"("parentFolderId");
CREATE INDEX IF NOT EXISTS "media_assets_projectId_idx" ON "media_assets"("projectId");
CREATE INDEX IF NOT EXISTS "media_assets_userId_idx" ON "media_assets"("userId");
CREATE INDEX IF NOT EXISTS "media_assets_mediaFolderId_idx" ON "media_assets"("mediaFolderId");
CREATE INDEX IF NOT EXISTS "media_tags_mediaAssetId_idx" ON "media_tags"("mediaAssetId");
CREATE INDEX IF NOT EXISTS "media_tags_tag_idx" ON "media_tags"("tag");
CREATE INDEX IF NOT EXISTS "content_packs_projectId_idx" ON "content_packs"("projectId");
CREATE INDEX IF NOT EXISTS "timelines_projectId_idx" ON "timelines"("projectId");
CREATE INDEX IF NOT EXISTS "subtitle_tracks_projectId_idx" ON "subtitle_tracks"("projectId");
CREATE INDEX IF NOT EXISTS "export_jobs_projectId_idx" ON "export_jobs"("projectId");
CREATE INDEX IF NOT EXISTS "recovery_snapshots_projectId_idx" ON "recovery_snapshots"("projectId");
CREATE INDEX IF NOT EXISTS "recovery_snapshots_expiresAt_idx" ON "recovery_snapshots"("expiresAt");
CREATE INDEX IF NOT EXISTS "analytics_events_userId_idx" ON "analytics_events"("userId");
CREATE INDEX IF NOT EXISTS "analytics_events_eventType_idx" ON "analytics_events"("eventType");
CREATE INDEX IF NOT EXISTS "analytics_events_createdAt_idx" ON "analytics_events"("createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_userId_read_idx" ON "analytics_events"("userId", "read");
CREATE INDEX IF NOT EXISTS "custom_fonts_userId_idx" ON "custom_fonts"("userId");
CREATE INDEX IF NOT EXISTS "font_usage_userId_count_idx" ON "font_usage"("userId", "count");
CREATE INDEX IF NOT EXISTS "voice_style_presets_userId_idx" ON "voice_style_presets"("userId");
CREATE INDEX IF NOT EXISTS "character_bundles_userId_idx" ON "character_bundles"("userId");
CREATE INDEX IF NOT EXISTS "connected_social_accounts_userId_idx" ON "connected_social_accounts"("userId");
CREATE INDEX IF NOT EXISTS "workspaces_ownerId_idx" ON "workspaces"("ownerId");
CREATE INDEX IF NOT EXISTS "workspace_members_userId_idx" ON "workspace_members"("userId");
CREATE INDEX IF NOT EXISTS "workspace_members_workspaceId_idx" ON "workspace_members"("workspaceId");

-- Foreign keys (use DO blocks to skip if already exists)
DO $$ BEGIN ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "projects" ADD CONSTRAINT "projects_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "property_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_scriptVersionId_fkey" FOREIGN KEY ("scriptVersionId") REFERENCES "script_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "media_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_mediaFolderId_fkey" FOREIGN KEY ("mediaFolderId") REFERENCES "media_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "content_packs" ADD CONSTRAINT "content_packs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "timelines" ADD CONSTRAINT "timelines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_exportJobId_fkey" FOREIGN KEY ("exportJobId") REFERENCES "export_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "recovery_snapshots" ADD CONSTRAINT "recovery_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "custom_fonts" ADD CONSTRAINT "custom_fonts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "font_usage" ADD CONSTRAINT "font_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "voice_style_presets" ADD CONSTRAINT "voice_style_presets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "character_bundles" ADD CONSTRAINT "character_bundles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "connected_social_accounts" ADD CONSTRAINT "connected_social_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

/* ------------------------------------------------------------------ */
/*  Reference data (each statement runs on its own — see pushSchema)   */
/* ------------------------------------------------------------------ */

const SEED_SQL = [
  `
-- Seed Property Templates
INSERT INTO "property_templates" ("id", "slug", "name", "description", "icon", "focusAreas", "aiSystemPrompt", "scriptStrategy", "socialFormat", "ctaStyle", "hashtagStrategy", "sortOrder", "updatedAt")
VALUES
('tpl_farmland', 'farmland', 'Farmland', 'Agricultural land with cultivation potential', 'TreePine', ARRAY['plot_size', 'water', 'soil', 'road_access', 'legal'], 'You are a real estate marketing expert specializing in farmland. Focus on soil quality, water sources, road access, legal clarity, and investment yield.', 'Open with location advantage, highlight acreage and water, emphasize RTC/legal, close with price and CTA.', 'Short punchy lines, emoji-light, location-first hooks for Instagram Reels.', 'Call now for site visit — limited plots', '#farmland #agriculture #investment #karnataka #realestate', 1, NOW()),
('tpl_plantation', 'plantation', 'Plantation', 'Established or developable plantation property', 'Palmtree', ARRAY['tree_count', 'yield', 'irrigation', 'road_access'], 'Expert in plantation properties. Emphasize tree counts, crop type, drip irrigation, annual yield potential, and maintenance.', 'Lead with plantation type and tree count, irrigation systems, income potential, then location and price.', 'Visual tree-count hooks, yield numbers in captions.', 'Schedule plantation walkthrough', '#plantation #farm #coconut #arecanut #invest', 2, NOW()),
('tpl_coconut_farm', 'coconut_farm', 'Coconut Farm', 'Coconut plantation with tree inventory', 'Palmtree', ARRAY['coconut_trees', 'water', 'drip_irrigation', 'yield'], 'Specialist in coconut farms. Always mention exact coconut tree count, borewell/water, drip irrigation status, and annual nut yield if known.', 'Hook with tree count, water security, irrigation, location distances, price per acre.', 'Tree-count headline, water + irrigation bullets.', 'Book coconut farm visit today', '#coconutfarm #coconut #farmland #mysuru #realestate', 3, NOW()),
('tpl_arecanut_farm', 'arecanut_farm', 'Arecanut Farm', 'Arecanut plantation property', 'Citrus', ARRAY['arecanut_trees', 'shade', 'irrigation', 'yield'], 'Expert in arecanut farms. Focus on tree count, shade structures, irrigation, and market-linked yield.', 'Tree inventory first, irrigation and shade, location, legal, price.', 'Yield-focused captions with tree statistics.', 'Contact for arecanut farm inspection', '#arecanut #plantation #farm #karnataka', 4, NOW()),
('tpl_farmhouse', 'farmhouse', 'Farmhouse', 'Weekend farmhouse or retreat property', 'Home', ARRAY['built_up_area', 'amenities', 'privacy', 'road_access'], 'Farmhouse lifestyle marketing. Emphasize peace, nature, built-up area, amenities, and weekend getaway appeal.', 'Lifestyle opening, amenities tour, location escape narrative, premium CTA.', 'Aspirational lifestyle tone, experience-first captions.', 'Experience your weekend escape — visit this weekend', '#farmhouse #weekendhome #nature #luxury', 5, NOW()),
('tpl_layout_site', 'layout_site', 'Layout Site', 'Residential layout plots', 'MapPin', ARRAY['plot_dimensions', 'approvals', 'infrastructure', 'location'], 'Layout site specialist. Highlight BDA/authority approvals, plot dimensions, road width, electricity, water, and appreciation corridor.', 'Approval status first, infrastructure, location connectivity, plot sizes and price.', 'Approval badges, dimension tables in carousel posts.', 'Reserve your plot — phase selling fast', '#layout #plots #bda #investment #site', 6, NOW()),
('tpl_villa_plot', 'villa_plot', 'Villa Plot', 'Premium villa plots in gated communities', 'Building2', ARRAY['gated_community', 'dimensions', 'amenities', 'location'], 'Premium villa plot marketing. Gated community, security, clubhouse amenities, plot dimensions, and elite location.', 'Open on the gated-community lifestyle, walk through amenities and security, then plot dimensions, location and price.', 'Luxury tone, amenity icons, exclusivity language.', 'Exclusive villa plots — enquire for premium sites', '#villaplot #luxury #gatedcommunity #premium', 7, NOW()),
('tpl_commercial_land', 'commercial_land', 'Commercial Land', 'Commercial or industrial land parcels', 'Store', ARRAY['zoning', 'frontage', 'highway_access', 'footfall'], 'Commercial land expert. Zoning, highway frontage, footfall potential, and business development opportunity.', 'Commercial viability, connectivity, frontage, ROI angle.', 'Business-investor tone, ROI and connectivity focus.', 'Commercial investors — schedule feasibility visit', '#commercial #land #business #investment', 8, NOW()),
('tpl_resort_property', 'resort_property', 'Resort Property', 'Resort, hospitality, or tourism land', 'Mountain', ARRAY['scenery', 'water_body', 'built_up', 'tourism_potential'], 'Resort and tourism property marketing. Scenic value, water features, existing structures, tourism and hospitality potential.', 'Scenic hook, tourism opportunity, infrastructure, investment or development CTA.', 'Visual storytelling, destination marketing style.', 'Discover your resort investment — private tour available', '#resort #tourism #hospitality #property', 9, NOW()),
('tpl_general', 'general', 'General Property', 'Flexible template for any property type', 'Globe', ARRAY['location', 'price', 'features', 'legal'], 'General real estate marketing assistant. Extract all facts accurately and present professionally in Kannada-English mix when requested.', 'Standard: location, size, features, legal, price, CTA.', 'Balanced professional tone across platforms.', 'Contact for more details and site visit', '#realestate #property #investment #karnataka', 10, NOW())
ON CONFLICT ("slug") DO NOTHING;
`,
  `
-- Seed Prompt Chips
INSERT INTO "prompt_chips" ("id", "label", "prompt", "category", "icon", "sortOrder")
VALUES
('chip_1', 'More Premium', 'Make the tone more premium and upscale', 'TONE', '✨', 1),
('chip_2', 'Investment Focus', 'Emphasize ROI, appreciation, and investment returns', 'TONE', '📈', 2),
('chip_3', 'Urgent Sale', 'Add urgency — limited time, act fast messaging', 'TONE', '🔥', 3),
('chip_4', 'NRI Investors', 'Target NRI investors with diaspora-friendly language', 'AUDIENCE', '🌍', 4),
('chip_5', 'Weekend Farmers', 'Appeal to weekend farmers and hobby agriculturists', 'AUDIENCE', '🌾', 5),
('chip_6', 'Shorter Script', 'Reduce length by 30% while keeping key facts', 'STYLE', '✂️', 6),
('chip_7', 'More Kannada', 'Increase Kannada proportion in bilingual output', 'STYLE', '🇮🇳', 7),
('chip_8', 'Highlight Water', 'Emphasize water sources, borewell, and irrigation', 'FEATURE', '💧', 8),
('chip_9', 'Highlight Trees', 'Lead with plantation and tree count details', 'FEATURE', '🌴', 9),
('chip_10', 'Stronger CTA', 'End with a stronger call-to-action and contact prompt', 'FEATURE', '📞', 10)
ON CONFLICT ("id") DO NOTHING;
`,
];

/**
 * Start the Next.js server as a child process.
 * Resolves once the server responds to a health-check request.
 */
export async function startNextServer(opts: ServerOpts): Promise<void> {
  const { webAppDir, port, env, onLog } = opts;

  // Decide which mode to use.
  const standaloneEntry = path.join(
    webAppDir,
    ".next",
    "standalone",
    "server.js"
  );
  const nextBin = path.join(
    webAppDir,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );

  let cmd: string;
  let args: string[];

  if (fs.existsSync(standaloneEntry)) {
    // Standalone mode
    cmd = process.execPath; // node
    args = [standaloneEntry];
  } else if (fs.existsSync(nextBin)) {
    // Full mode — run next start
    cmd = process.execPath;
    args = [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"];
  } else {
    throw new Error(
      `Cannot find Next.js in ${webAppDir}. ` +
        "Run `npm install && npm run build` in the Web Application directory first."
    );
  }

  const mergedEnv: Record<string, string> = {
    ...filterEnv(process.env),
    ...env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    // `cmd` here is process.execPath — Electron's own binary, used as a
    // stand-in for a plain `node` executable. In dev, the generic Electron
    // binary happily runs an arbitrary script path as a plain Node process.
    // But the PACKAGED binary has this app's own main.js baked in as its
    // default entry, so without this flag it ignores the script path and
    // relaunches a second full copy of the desktop app instead of running
    // the Next.js server.
    ELECTRON_RUN_AS_NODE: "1",
  };

  serverProcess = spawn(cmd, args, {
    cwd: webAppDir,
    env: mergedEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  // Pipe logs through callback
  const relay = (stream: NodeJS.ReadableStream | null) => {
    stream?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString("utf-8").split("\n").filter(Boolean);
      lines.forEach((line) => {
        onLog?.(line);
        console.log("[next]", line);
      });
    });
  };
  relay(serverProcess.stdout);
  relay(serverProcess.stderr);

  serverProcess.on("exit", (code) => {
    console.log(`[next] Server exited with code ${code}`);
    serverProcess = null;
  });

  // Wait for the server to become ready
  await waitForServer(port, 45_000);
}

/**
 * Kill the Next.js server child process.
 */
export function stopNextServer(): void {
  if (!serverProcess) return;
  try {
    if (process.platform === "win32") {
      // On Windows, child processes spawned with windowsHide may need
      // explicit tree-kill.  Kill the process group if possible.
      execSync(`taskkill /pid ${serverProcess.pid} /t /f`, { stdio: "ignore" });
    } else {
      serverProcess.kill("SIGTERM");
    }
  } catch {
    // Best-effort
  }
  serverProcess = null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Poll the server until it responds (or timeout). */
async function waitForServer(
  port: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ok = await probe(port);
    if (ok) return;
    await sleep(600);
  }

  throw new Error(
    `Next.js server did not respond within ${Math.round(timeoutMs / 1000)}s on port ${port}`
  );
}

function probe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: "/", timeout: 2000 },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip undefined values from process.env so Record<string,string> is clean. */
function filterEnv(
  env: NodeJS.ProcessEnv
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
