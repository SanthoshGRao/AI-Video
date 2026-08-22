import { ZipArchive } from "archiver";
import { Readable } from "stream";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { trackEvent } from "@/lib/analytics/track";
import { openAssetStream, assetExtension } from "@/lib/transfer/asset-source";
import { referencedMediaIds } from "@/lib/transfer/remap";
import { accessibleProjectWhere } from "@/lib/workspace/access";
import {
  AUDIO_PREFIX,
  BUNDLE_FORMAT_VERSION,
  MANIFEST_ENTRY,
  MEDIA_PREFIX,
  PROJECT_ENTRY,
  bundleFileName,
  type BundleManifest,
  type BundledProject,
} from "@/lib/transfer/bundle";

export const runtime = "nodejs";
// Bundling gigabytes of media is not a 60-second job.
export const maxDuration = 800;

type RouteContext = { params: Promise<{ id: string }> };

const iso = (d: Date) => d.toISOString();

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        template: { select: { slug: true } },
        scriptVersions: { orderBy: { versionNumber: "asc" } },
        mediaFolders: { orderBy: { createdAt: "asc" } },
        mediaAssets: {
          orderBy: { createdAt: "asc" },
          include: { mediaTags: true },
        },
        audioAssets: { orderBy: { createdAt: "asc" } },
        subtitleTracks: { orderBy: { createdAt: "asc" } },
        timelines: { orderBy: { version: "asc" } },
        contentPacks: { orderBy: { version: "asc" } },
      },
    });

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    // A timeline can place assets from the user's global library — rows whose
    // `projectId` is null or points elsewhere, so the include above misses them.
    // Leaving them out would produce a bundle that imports with black gaps, so
    // pull in whatever the timeline actually depends on.
    const ownIds = new Set(project.mediaAssets.map((m) => m.id));
    const externalIds = [...referencedMediaIds(project.timelines)].filter(
      (mid) => !ownIds.has(mid)
    );

    // Scoped deliberately: these ids come out of timeline JSON, which is user
    // -writable, so an edited timeline must not be able to name an arbitrary
    // asset id and have export hand back someone else's file.
    const externalAssets = externalIds.length
      ? await prisma.mediaAsset.findMany({
          where: {
            id: { in: externalIds },
            OR: [
              { userId: user.id },
              { project: await accessibleProjectWhere(user.id) },
            ],
          },
          include: { mediaTags: true },
        })
      : [];

    // Folder ids only make sense inside this project, so library assets join the
    // bundle unfiled rather than pointing at a folder that is not travelling.
    const allMediaAssets = [
      ...project.mediaAssets,
      ...externalAssets.map((m) => ({ ...m, mediaFolderId: null })),
    ];

    const doc: BundledProject = {
      title: project.title,
      templateSlug: project.template?.slug ?? null,
      propertyData: project.propertyData ?? null,
      extractedFacts: project.extractedFacts ?? null,
      validatedFacts: project.validatedFacts ?? null,
      targetAudience: project.targetAudience,
      language: project.language,
      tone: project.tone,
      ctaStyle: project.ctaStyle,
      durationSeconds: project.durationSeconds,
      status: project.status,

      scriptVersions: project.scriptVersions.map((s) => ({
        id: s.id,
        generationBatch: s.generationBatch,
        versionNumber: s.versionNumber,
        variationStyle: s.variationStyle,
        content: s.content,
        language: s.language,
        wordCount: s.wordCount,
        estimatedDuration: s.estimatedDuration,
        isApproved: s.isApproved,
        isActive: s.isActive,
        factCheckPassed: s.factCheckPassed,
        factCheckReport: s.factCheckReport ?? null,
        createdAt: iso(s.createdAt),
      })),

      mediaFolders: project.mediaFolders.map((f) => ({
        id: f.id,
        parentFolderId: f.parentFolderId,
        name: f.name,
        description: f.description,
        createdAt: iso(f.createdAt),
      })),

      mediaAssets: allMediaAssets.map((m) => ({
        id: m.id,
        mediaFolderId: m.mediaFolderId,
        type: m.type,
        originalName: m.originalName,
        r2Key: m.r2Key,
        r2Url: m.r2Url,
        thumbnailUrl: m.thumbnailUrl,
        thumbnailR2Key: m.thumbnailR2Key,
        width: m.width,
        height: m.height,
        durationMs: m.durationMs,
        fileSizeBytes: m.fileSizeBytes,
        mimeType: m.mimeType,
        createdAt: iso(m.createdAt),
        tags: m.mediaTags.map((t) => ({
          tag: t.tag,
          confidence: t.confidence,
          source: t.source,
        })),
        file: MEDIA_PREFIX + m.id + assetExtension(m.originalName, m.r2Key),
      })),

      audioAssets: project.audioAssets.map((a) => ({
        id: a.id,
        scriptVersionId: a.scriptVersionId,
        voiceType: a.voiceType,
        voiceStyleLabel: a.voiceStyleLabel,
        r2Key: a.r2Key,
        r2Url: a.r2Url,
        durationMs: a.durationMs,
        waveformData: a.waveformData ?? null,
        wordTimestamps: a.wordTimestamps ?? null,
        createdAt: iso(a.createdAt),
        file: AUDIO_PREFIX + a.id + assetExtension(null, a.r2Key),
      })),

      subtitleTracks: project.subtitleTracks.map((t) => ({
        id: t.id,
        audioAssetId: t.audioAssetId,
        language: t.language,
        cues: t.cues ?? [],
        stylePreset: t.stylePreset,
        customStyle: t.customStyle ?? null,
        isBurntIn: t.isBurntIn,
        createdAt: iso(t.createdAt),
      })),

      timelines: project.timelines.map((t) => ({
        id: t.id,
        version: t.version,
        tracks: t.tracks ?? [],
        clips: t.clips ?? {},
        transitions: t.transitions ?? [],
        textLayers: t.textLayers ?? [],
        settings: t.settings ?? {},
        isAutosave: t.isAutosave,
        isAiGenerated: t.isAiGenerated,
        createdAt: iso(t.createdAt),
      })),

      contentPacks: project.contentPacks.map((c) => ({
        id: c.id,
        version: c.version,
        instagramCaptions: c.instagramCaptions ?? null,
        facebookCopies: c.facebookCopies ?? null,
        whatsappCopies: c.whatsappCopies ?? null,
        telegramCopy: c.telegramCopy ?? null,
        youtubeDescriptions: c.youtubeDescriptions ?? null,
        ctaVariations: c.ctaVariations ?? null,
        hashtagSets: c.hashtagSets ?? null,
        seoMetadata: c.seoMetadata ?? null,
        propertyHighlights: c.propertyHighlights ?? null,
        googleBusinessPost: c.googleBusinessPost ?? null,
        selectedPlatforms: c.selectedPlatforms ?? null,
        isActive: c.isActive,
        createdAt: iso(c.createdAt),
      })),
    };

    const manifest: BundleManifest = {
      formatVersion: BUNDLE_FORMAT_VERSION,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.1.8",
      exportedAt: new Date().toISOString(),
      projectTitle: project.title,
      counts: {
        scriptVersions: doc.scriptVersions.length,
        mediaAssets: doc.mediaAssets.length,
        audioAssets: doc.audioAssets.length,
        timelines: doc.timelines.length,
        subtitleTracks: doc.subtitleTracks.length,
        contentPacks: doc.contentPacks.length,
        mediaFolders: doc.mediaFolders.length,
      },
      totalFileBytes: allMediaAssets.reduce(
        (n, m) => n + (m.fileSizeBytes || 0),
        0
      ),
    };

    // store = no deflate. Video and audio are already compressed, so
    // re-deflating them burns CPU for ~0% gain and would make a multi-GB export
    // crawl. The JSON entries are small enough that storing them costs nothing.
    const archive = new ZipArchive({ store: true });

    archive.on("warning", (err: Error) => {
      // ENOENT here means one asset vanished mid-stream. Log it and keep going:
      // a bundle missing one clip still beats no bundle at all.
      console.warn("[export-bundle] archive warning:", err);
    });
    archive.on("error", (err: Error) => {
      console.error("[export-bundle] archive error:", err);
    });

    // Append binaries lazily so memory stays flat regardless of bundle size.
    void (async () => {
      try {
        for (const m of allMediaAssets) {
          const entry = doc.mediaAssets.find((x) => x.id === m.id);
          if (!entry?.file) continue;
          const src = await openAssetStream(m);
          if (!src) {
            console.warn("[export-bundle] missing media binary:", m.id);
            entry.file = null;
            continue;
          }
          archive.append(src.stream, { name: entry.file });
        }

        for (const a of project.audioAssets) {
          const entry = doc.audioAssets.find((x) => x.id === a.id);
          if (!entry?.file) continue;
          const src = await openAssetStream(a);
          if (!src) {
            console.warn("[export-bundle] missing audio binary:", a.id);
            entry.file = null;
            continue;
          }
          archive.append(src.stream, { name: entry.file });
        }

        // JSON goes in last on purpose: the loops above null out `file` for any
        // asset whose bytes turned out to be missing, and import reads that
        // field to report exactly what did not travel.
        archive.append(JSON.stringify(manifest, null, 2), {
          name: MANIFEST_ENTRY,
        });
        archive.append(JSON.stringify(doc, null, 2), { name: PROJECT_ENTRY });
        await archive.finalize();
      } catch (e) {
        console.error("[export-bundle] failed while streaming:", e);
        archive.abort();
      }
    })();

    void trackEvent(user.id, "project_exported_bundle", {
      projectId: id,
      mediaCount: doc.mediaAssets.length,
    }).catch(() => {});

    const webStream = Readable.toWeb(archive as unknown as Readable);

    return new Response(webStream as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition":
          'attachment; filename="' + bundleFileName(project.title) + '"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
