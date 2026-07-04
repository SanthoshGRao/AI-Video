# CLAUDE.md

Project context for Claude Code. This file is auto-loaded every session — **keep it tight** (a bloated file costs tokens every turn). Record real architectural changes and gotchas here; don't dump transient detail. See the **Changelog** at the bottom.

## Product

`ai-realestate-video` — a web app that turns raw property details into short vertical real-estate promo videos (Instagram Reels / YouTube Shorts): AI-generated Kanglish/Hinglish scripts → TTS voiceover → subtitles + fact overlays → timeline editor → Remotion export. Target audience: Karnataka/Mysuru real-estate agents.

## Commands

- `npm run dev` — Next.js dev (webpack). `npm run dev:turbo` for turbopack.
- `npm run build` — `prisma generate && next build`.
- `npm run test` — Jest. `npm run playwright:test` — E2E.
- `npm run lint` — ESLint.
- DB: `npm run db:push` (schema), `db:migrate`, `db:studio`, `db:seed`, `db:generate`. Prisma client is generated to `src/generated/prisma` (custom output) — import from there, not `@prisma/client` internals.
- `npm run check:whisperx` (`scripts/check-whisperx.js`) — verify the Python WhisperX/stable-ts STT aligner install. `node scripts/check-db.js` — DB connectivity smoke test.
- **Run a one-off DB/TS script:** `npx dotenv-cli -e .env.local -- npx tsx <file>.ts` (needed to load `DATABASE_URL` + API keys).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 → **PostgreSQL/Supabase** (`DATABASE_URL` pooled + `DIRECT_URL` in `.env.local`) · Clerk auth (`@clerk/nextjs`, middleware + `webhooks/clerk`) · Vercel AI SDK (`ai`; `@ai-sdk/openai` active as `defaultModel`=gpt-4o, `@ai-sdk/groq` wired as a commented alt in `src/lib/ai/client.ts`) · Remotion 4 (export render) · Zustand · Tailwind.

**Env / providers** (see `.env.example`): `OPENAI_API_KEY`, `GROQ_API_KEY`, `GOOGLE_AI_API_KEY` (Gemini — script gen + TTS + STT align), `GOOGLE_TTS_MODEL`. Storage backends: **Cloudflare R2** (`CLOUDFLARE_R2_*`), **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`), or local fallback. Also `REDIS_URL`, `WORKER_SECRET` (async render jobs).

⚠️ **Many pre-existing TS errors** (especially `src/_designcombo`). When typechecking, filter output to the files you touched.

## Data model (Prisma)

User, BrandKit, PropertyTemplate, PromptChip, Project, ScriptVersion, AudioAsset, MediaAsset, MediaTag, ContentPack, Timeline, SubtitleTrack, ExportJob, RenderJob, RecoverySnapshot, AnalyticsEvent, ConnectedSocialAccount.

## End-to-end pipeline

API routes live under `src/app/api/projects/[id]/`. Flow:

1. **Facts** — property `rawText` → `extractFactsFromText` (`src/lib/ai/extract-facts.ts`) → `Project.extractedFacts`; validated into an envelope (`src/lib/facts/`).
2. **Scripts** — `generate-script` + `refine-script` → 3 `ScriptVersion` rows (`VARIATIONS` in `src/lib/scripts/versioning.ts`). Written by **Gemini** (see TTS/Script rules).
3. **Voiceover** — `generate-voiceover` / `tts` → `AudioAsset`. `synthesizeSpeech` (`src/lib/tts/synthesize-speech.ts`) prefers **Google Gemini TTS** (`google-cloud-tts.ts`, model = `GOOGLE_TTS_MODEL`) and falls back to free **Edge TTS** (`edge-tts.ts`); `openai-tts.ts` also present.
4. **Subtitles** — `facts/align` → `SubtitleTrack` (per-cue timing via STT alignment). Aligners: `gemini-stt-align.ts` and `stable-ts-align.ts` (Python WhisperX/stable-ts — see `npm run check:whisperx`).
5. **Editor init** — `editor/initialize` → `OpenCutProjectInitializer` (`src/lib/opencut/project-initializer.ts`) builds an OpenCut project (`project-mapper.ts` + track builders) and saves a `Timeline` row via `openCutProjectToTimelineDocument` (`src/opencut/generated-assets-mapper.ts`).
6. **Export** — `export` → Remotion headless render (`src/lib/editor/render-with-remotion.ts` + `src/remotion/export-player.tsx` + `src/lib/engine/compositor.ts`).

## Key directories

- `src/lib/ai` — model clients. `defaultModel` = gpt-4o (`client.ts`); `gemini-text.ts` = Gemini REST helper for script writing.
- `src/lib/tts` — voices, synthesis, normalization, STT alignment.
- `src/lib/scripts`, `src/lib/facts`, `src/lib/subtitles`.
- `src/lib/opencut` — DB assets → OpenCut project mapping.
- `src/lib/editor` + `src/lib/editor-v2` (active) + `src/lib/engine` (Compositor) + `src/remotion` (export player) + `src/lib/timeline`.
- `src/lib/storage` — pluggable backends (R2 / Vercel Blob / local); assets served via `/api/storage/[category]/[projectId]/[...path]`.
- App pages: `dashboard/*`, `dashboard/projects/[id]` (+`/content`), `editor/[project_id]`, `scene-editor/[id]`.

## Conventions & gotchas

- **THREE parallel editor implementations:** `src/lib/editor-v2` is **ACTIVE** (export dialog, reads the `Timeline` DB row). `src/stores/editor-store.ts` + `src/_designcombo` = designcombo (legacy-ish, many TS errors). `src/components/editor` = separate client export.
- **Two scene shapes:** the core-editor engine (`src/core`, `src/timeline`, `src/services/renderer`, `src/media`) uses `scene.tracks = { main, overlay, audio }` (**object**). The `@/opencut/types` `OpenCutScene.tracks` is an **array**. This mismatch has caused crashes — normalize both shapes when consuming.
- **Script/TTS language rules** (Kanglish, kn-IN): sentence skeleton is spoken Kannada; English words (numbers/units/technical/brand) stay in **Latin script — never transliterate into Kannada script** (that produces misspelled, robotic audio). Scripts must be **natural AND cover all key facts** (don't drop details for brevity). Numbers stay English; decimals expanded ("1.22" → "1 point 22").
- **Storage is pluggable, but DB columns are R2-named:** `MediaAsset.r2Key`/`r2Url` (and `thumbnailR2Key`) hold keys regardless of the active backend (R2, Vercel Blob, or local). Resolve to a servable URL via `serializeMediaAsset`/`serializeAudioAsset` (`src/lib/storage/serialize.ts`) — don't hand raw `r2Url` to the client.
- **Diagnostic scripts (repo root):** `check-jobs.ts` (recent ExportJob rows); scratchpad `test-render.ts` (renders newest DB timeline). Run via the dotenv-cli/tsx incantation above.
- **Remotion bundle cache** (`.remotion-cache/bundle`) is keyed on a content fingerprint of the render source dirs, so edits auto-invalidate. If exports seem stale, `rm -rf .remotion-cache/bundle`.

## Maintaining this file

When you make a meaningful change to the project (new pipeline stage, changed architecture, new gotcha, moved/renamed key file), **add a dated one-line entry to the Changelog and update the affected section above**. Keep entries terse; summarize/prune old ones so this file stays small. Deep detail lives in the recall memories (export pipeline, TTS/script pipeline), not here.

## Changelog

- **2026-07-04** — Doc pass (`/init`): corrected TTS to Google Gemini **with Edge fallback** (`synthesize-speech.ts`, not just "Gemini TTS"); documented multi-backend storage (R2/Vercel Blob/local) + R2-named DB columns gotcha; noted STT aligners (`gemini-stt-align`, `stable-ts-align`, WhisperX) and `check:whisperx`/`check-db` scripts; expanded env/provider list (Groq alt, `DIRECT_URL`, `GOOGLE_TTS_MODEL`, storage tokens, `REDIS_URL`/`WORKER_SECRET`); noted Prisma client output at `src/generated/prisma`.
- **2026-07-04** — Script generation switched from GPT-4o to **Gemini** (`src/lib/ai/gemini-text.ts`, model `gemini-2.5-flash`, GPT-4o fallback) in `generate-script` + `refine-script`; Gemini is far stronger at Kannada.
- **2026-07-04** — Redesigned the Kannada script-gen prompt (`generate-script/route.ts`): removed the "approved-particles-only" whitelist + checklist reference scripts (were making output robotic/identical), softened word-count penalty, added "cover ALL facts, naturally" rules. Balance = natural **and** complete.
- **2026-07-04** — Killed the English→Kannada transliteration pass in TTS Phase-1 normalization (`src/lib/tts/synthesize-voiceover.ts`) — it was the main source of misspelled, artificial-sounding merged words. Toned down Kannada director's notes in `src/lib/tts/voices.ts` for a more natural, less over-expressive read.
- **2026-07-04** — Fixed `editor/initialize` crash ("object is not iterable"): `openCutProjectToTimelineDocument` (`src/opencut/generated-assets-mapper.ts`) now normalizes `scene.tracks` whether it's an array or a `{main, overlay, audio}` object.
