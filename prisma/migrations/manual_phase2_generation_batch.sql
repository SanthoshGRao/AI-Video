-- Run if `npx prisma db push` hangs (Supabase pooler). Options:
-- 1) Supabase SQL editor — paste this file
-- 2) DIRECT_URL in .env.local, then:
--    node -e "require('dotenv').config({path:'.env.local'}); const {execSync}=require('child_process'); execSync('npx prisma db execute --file prisma/migrations/manual_phase2_generation_batch.sql',{env:{...process.env,DATABASE_URL:process.env.DIRECT_URL||process.env.DATABASE_URL},stdio:'inherit'})"

ALTER TABLE "script_versions"
  ADD COLUMN IF NOT EXISTS "generationBatch" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "script_versions_projectId_generationBatch_idx"
  ON "script_versions"("projectId", "generationBatch");

ALTER TABLE "media_assets"
  ADD COLUMN IF NOT EXISTS "localPath" TEXT;

ALTER TABLE "media_assets"
  ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;

ALTER TABLE "media_assets"
  ADD COLUMN IF NOT EXISTS "thumbnailR2Key" TEXT;
