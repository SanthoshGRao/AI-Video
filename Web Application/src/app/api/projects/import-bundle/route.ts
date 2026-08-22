import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import unzipper from "unzipper";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { trackEvent } from "@/lib/analytics/track";
import { resolveTargetWorkspaceId } from "@/lib/workspace/access";
import { remapTimeline, type IdMap } from "@/lib/transfer/remap";
import {
  BUNDLE_FORMAT_VERSION,
  MANIFEST_ENTRY,
  PROJECT_ENTRY,
  type BundleManifest,
  type BundledProject,
} from "@/lib/transfer/bundle";
import { StorageCategory, filePath, projectDir, publicUrl, storageKey } from "@/lib/storage/paths";
import { isBlobEnabled, uploadBlob } from "@/lib/storage/blob-storage";
import { isVercelDeployment } from "@/lib/storage/paths";
import type { MediaType, ProjectStatus } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * Import a `.aivproj` bundle as a brand new project.
 *
 * The body is the raw bundle, not multipart — the browser streams a File
 * straight through, and this end pipes it to a temp file without ever holding
 * the whole thing in memory. Multipart would have meant buffering gigabytes to
 * parse a single field.
 */
export async function POST(request: Request) {
  const tempPath = path.join(
    os.tmpdir(),
    `aivproj-import-${crypto.randomUUID()}.zip`
  );

  try {
    const user = await getOrCreateDbUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const workspaceId = await resolveTargetWorkspaceId(
      user.id,
      url.searchParams.get("workspaceId")
    );

    if (!request.body) {
      throw badRequest("No file uploaded");
    }

    // ---- Spool the upload to disk ----------------------------------------
    await pipeline(
      Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
      fs.createWriteStream(tempPath)
    );

    const stat = await fs.promises.stat(tempPath);
    if (stat.size === 0) {
      throw badRequest("The uploaded file is empty");
    }

    // ---- Read the archive ------------------------------------------------
    let directory: unzipper.CentralDirectory;
    try {
      directory = await unzipper.Open.file(tempPath);
    } catch {
      throw badRequest(
        "That file is not a readable project bundle (.aivproj)"
      );
    }

    const byName = new Map(directory.files.map((f) => [f.path, f]));

    const projectEntry = byName.get(PROJECT_ENTRY);
    if (!projectEntry) {
      throw badRequest(
        "This bundle is missing project.json — it may be corrupt or from a different app"
      );
    }

    const manifestEntry = byName.get(MANIFEST_ENTRY);
    const manifest: BundleManifest | null = manifestEntry
      ? (JSON.parse((await manifestEntry.buffer()).toString("utf8")) as BundleManifest)
      : null;

    if (manifest && manifest.formatVersion > BUNDLE_FORMAT_VERSION) {
      throw badRequest(
        `This bundle was made by a newer version of the app (format v${manifest.formatVersion}). Please update and try again.`
      );
    }

    const doc = JSON.parse(
      (await projectEntry.buffer()).toString("utf8")
    ) as BundledProject;

    if (!doc || typeof doc.title !== "string") {
      throw badRequest("This bundle's project data is unreadable");
    }

    // ---- Create the project ---------------------------------------------
    const template = doc.templateSlug
      ? await prisma.propertyTemplate.findUnique({
          where: { slug: doc.templateSlug },
        })
      : null;

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        workspaceId,
        templateId: template?.id ?? null,
        title: doc.title,
        propertyData: (doc.propertyData ?? undefined) as never,
        extractedFacts: (doc.extractedFacts ?? undefined) as never,
        validatedFacts: (doc.validatedFacts ?? undefined) as never,
        targetAudience: doc.targetAudience ?? null,
        language: doc.language ?? "kannada_english",
        tone: doc.tone ?? "professional",
        ctaStyle: doc.ctaStyle ?? "standard",
        durationSeconds: doc.durationSeconds ?? 60,
        // Anything mid-render in the source account is not mid-render here.
        status: normalizeStatus(doc.status),
      },
    });

    const warnings: string[] = [];

    // ---- Scripts ---------------------------------------------------------
    const scriptMap: IdMap = new Map();
    for (const s of doc.scriptVersions ?? []) {
      const created = await prisma.scriptVersion.create({
        data: {
          projectId: project.id,
          generationBatch: s.generationBatch ?? 1,
          versionNumber: s.versionNumber ?? 1,
          variationStyle: s.variationStyle ?? "imported",
          content: s.content ?? "",
          language: s.language ?? project.language,
          wordCount: s.wordCount ?? 0,
          estimatedDuration: s.estimatedDuration ?? 0,
          isApproved: !!s.isApproved,
          isActive: !!s.isActive,
          factCheckPassed: !!s.factCheckPassed,
          factCheckReport: (s.factCheckReport ?? undefined) as never,
        },
      });
      scriptMap.set(s.id, created.id);
    }

    // ---- Folders ---------------------------------------------------------
    // Created flat first, then re-parented, so the bundle's folder order (and
    // any cycle a corrupted bundle might contain) can't wedge the import.
    const folderMap: IdMap = new Map();
    for (const f of doc.mediaFolders ?? []) {
      const created = await prisma.mediaFolder.create({
        data: {
          userId: user.id,
          projectId: project.id,
          name: f.name ?? "Folder",
          description: f.description ?? null,
        },
      });
      folderMap.set(f.id, created.id);
    }
    for (const f of doc.mediaFolders ?? []) {
      const newId = folderMap.get(f.id);
      const newParent = f.parentFolderId ? folderMap.get(f.parentFolderId) : null;
      if (newId && newParent) {
        await prisma.mediaFolder.update({
          where: { id: newId },
          data: { parentFolderId: newParent },
        });
      }
    }

    // ---- Media assets ----------------------------------------------------
    const mediaMap: IdMap = new Map();
    for (const m of doc.mediaAssets ?? []) {
      const entry = m.file ? byName.get(m.file) : undefined;
      if (!entry) {
        warnings.push(`Media file missing from bundle: ${m.originalName}`);
        continue;
      }

      const created = await prisma.mediaAsset.create({
        data: {
          projectId: project.id,
          userId: user.id,
          mediaFolderId: m.mediaFolderId ? folderMap.get(m.mediaFolderId) ?? null : null,
          type: (m.type ?? "IMAGE") as MediaType,
          originalName: m.originalName ?? "imported",
          r2Key: "",
          r2Url: "",
          width: m.width ?? null,
          height: m.height ?? null,
          durationMs: m.durationMs ?? null,
          fileSizeBytes: m.fileSizeBytes ?? 0,
          mimeType: m.mimeType ?? "application/octet-stream",
        },
      });

      const stored = await writeImportedFile(
        StorageCategory.MEDIA,
        project.id,
        created.id + path.extname(m.file ?? "") ,
        entry,
        m.mimeType ?? undefined
      );

      await prisma.mediaAsset.update({
        where: { id: created.id },
        data: {
          r2Key: stored.key,
          r2Url: stored.url,
          fileSizeBytes: stored.sizeBytes || m.fileSizeBytes || 0,
        },
      });

      if (m.tags?.length) {
        await prisma.mediaTag.createMany({
          data: m.tags.map((t) => ({
            mediaAssetId: created.id,
            tag: t.tag,
            confidence: t.confidence ?? 0,
            source: t.source ?? "ai",
          })),
        });
      }

      mediaMap.set(m.id, created.id);
    }

    // ---- Audio assets ----------------------------------------------------
    const audioMap: IdMap = new Map();
    for (const a of doc.audioAssets ?? []) {
      const entry = a.file ? byName.get(a.file) : undefined;
      if (!entry) {
        warnings.push("A voiceover track was missing from the bundle");
        continue;
      }

      const created = await prisma.audioAsset.create({
        data: {
          projectId: project.id,
          scriptVersionId: a.scriptVersionId
            ? scriptMap.get(a.scriptVersionId) ?? null
            : null,
          voiceType: a.voiceType ?? "imported",
          voiceStyleLabel: a.voiceStyleLabel ?? null,
          r2Key: "",
          r2Url: "",
          durationMs: a.durationMs ?? 0,
          waveformData: (a.waveformData ?? undefined) as never,
          wordTimestamps: (a.wordTimestamps ?? undefined) as never,
        },
      });

      const stored = await writeImportedFile(
        StorageCategory.AUDIO,
        project.id,
        created.id + path.extname(a.file ?? ""),
        entry
      );

      await prisma.audioAsset.update({
        where: { id: created.id },
        data: { r2Key: stored.key, r2Url: stored.url },
      });

      audioMap.set(a.id, created.id);
    }

    // ---- Subtitles -------------------------------------------------------
    const subtitleMap: IdMap = new Map();
    for (const t of doc.subtitleTracks ?? []) {
      const created = await prisma.subtitleTrack.create({
        data: {
          projectId: project.id,
          audioAssetId: t.audioAssetId ? audioMap.get(t.audioAssetId) ?? null : null,
          language: t.language ?? project.language,
          cues: (t.cues ?? []) as never,
          stylePreset: t.stylePreset ?? "instagram_reels",
          customStyle: (t.customStyle ?? undefined) as never,
          isBurntIn: !!t.isBurntIn,
        },
      });
      subtitleMap.set(t.id, created.id);
    }

    // ---- Timelines -------------------------------------------------------
    let droppedClips = 0;
    for (const t of doc.timelines ?? []) {
      const remapped = remapTimeline(t, {
        media: mediaMap,
        audio: audioMap,
        subtitle: subtitleMap,
      });
      droppedClips += remapped.droppedClipIds.length;

      await prisma.timeline.create({
        data: {
          projectId: project.id,
          version: t.version ?? 1,
          tracks: remapped.tracks as never,
          clips: remapped.clips as never,
          transitions: remapped.transitions as never,
          textLayers: remapped.textLayers as never,
          settings: remapped.settings as never,
          isAutosave: !!t.isAutosave,
          isAiGenerated: !!t.isAiGenerated,
        },
      });
    }
    if (droppedClips > 0) {
      warnings.push(
        `${droppedClips} timeline clip(s) were dropped because their media was not in the bundle`
      );
    }

    // ---- Content packs ---------------------------------------------------
    for (const c of doc.contentPacks ?? []) {
      await prisma.contentPack.create({
        data: {
          projectId: project.id,
          version: c.version ?? 1,
          instagramCaptions: (c.instagramCaptions ?? undefined) as never,
          facebookCopies: (c.facebookCopies ?? undefined) as never,
          whatsappCopies: (c.whatsappCopies ?? undefined) as never,
          telegramCopy: (c.telegramCopy ?? undefined) as never,
          youtubeDescriptions: (c.youtubeDescriptions ?? undefined) as never,
          ctaVariations: (c.ctaVariations ?? undefined) as never,
          hashtagSets: (c.hashtagSets ?? undefined) as never,
          seoMetadata: (c.seoMetadata ?? undefined) as never,
          propertyHighlights: (c.propertyHighlights ?? undefined) as never,
          googleBusinessPost: (c.googleBusinessPost ?? undefined) as never,
          selectedPlatforms: (c.selectedPlatforms ?? undefined) as never,
          isActive: !!c.isActive,
        },
      });
    }

    void trackEvent(user.id, "project_imported_bundle", {
      projectId: project.id,
      mediaCount: mediaMap.size,
      warnings: warnings.length,
    });

    return Response.json(
      {
        project: {
          id: project.id,
          title: project.title,
          workspaceId: project.workspaceId,
        },
        imported: {
          scriptVersions: scriptMap.size,
          mediaAssets: mediaMap.size,
          audioAssets: audioMap.size,
          subtitleTracks: subtitleMap.size,
          timelines: (doc.timelines ?? []).length,
          contentPacks: (doc.contentPacks ?? []).length,
        },
        warnings,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  } finally {
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}

/** ARCHIVED survives; every transient render state lands back on DRAFT. */
function normalizeStatus(status: string | undefined): ProjectStatus {
  const carried: ProjectStatus[] = [
    "DRAFT",
    "CONTENT_READY",
    "MEDIA_UPLOADED",
    "EDITING",
    "EXPORTED",
    "ARCHIVED",
  ];
  return carried.includes(status as ProjectStatus)
    ? (status as ProjectStatus)
    : "DRAFT";
}

/**
 * Land one bundled binary in this deployment's storage — local disk in dev and
 * on the desktop, Vercel Blob in production. Streams to disk where it can;
 * Blob's API needs a Buffer, so there it holds one file at a time.
 */
async function writeImportedFile(
  category: (typeof StorageCategory)[keyof typeof StorageCategory],
  projectId: string,
  fileName: string,
  entry: { stream: () => NodeJS.ReadableStream; buffer: () => Promise<Buffer> },
  contentType?: string
): Promise<{ key: string; url: string; sizeBytes: number }> {
  if (isBlobEnabled()) {
    const buf = await entry.buffer();
    const result = await uploadBlob(category, projectId, fileName, buf, contentType);
    return { key: result.key, url: result.url, sizeBytes: result.sizeBytes };
  }

  if (isVercelDeployment()) {
    // Vercel without Blob configured: the filesystem is read-only/ephemeral, so
    // there is nowhere durable to put this.
    throw badRequest(
      "File storage is not configured on this deployment, so bundles cannot be imported"
    );
  }

  const dir = projectDir(category, projectId);
  await fs.promises.mkdir(dir, { recursive: true });
  const dest = filePath(category, projectId, fileName);

  await pipeline(entry.stream(), fs.createWriteStream(dest));
  const stat = await fs.promises.stat(dest);

  return {
    key: storageKey(category, projectId, fileName),
    url: publicUrl(category, projectId, fileName),
    sizeBytes: stat.size,
  };
}
