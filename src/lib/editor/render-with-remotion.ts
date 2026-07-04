import path from "path";
import fs from "fs";
import os from "os";
import http from "http";
import { bundle } from "@remotion/bundler";
import { renderMedia } from "@remotion/renderer";
import prisma from "@/lib/db/prisma";
import { parseTimelineRow } from "@/lib/timeline/parse";
import { parseCuesJson } from "@/lib/subtitles/cues";
import { resolveSubtitleStyle } from "@/lib/subtitles/presets";
import { timelineDocumentToElements, getSubtitlesFromTimeline } from "@/lib/editor/timeline-adapter";
import { projectAssetsToRenderDoc } from "@/lib/editor/render-doc-adapter";
import { runFfmpeg } from "@/lib/editor/ffmpeg";
import type { LoadedProjectAssets } from "@/lib/editor/types";
import type { SubtitleStyle } from "@/lib/subtitles/types";
import type { TimelineDocument } from "@/lib/timeline/types";
import type { RenderDoc } from "@/lib/editor/render-types";
import {
  assertInsideStorage,
  filePath,
  projectDir,
  StorageCategory,
  type StorageCategoryType,
  parseStorageKey,
} from "@/lib/storage/paths";
import crypto from "crypto";
import { mimeFromFileName, saveBufferAsync } from "@/lib/storage/local";

const BUNDLE_CACHE_DIR = path.join(process.cwd(), ".remotion-cache");
const CACHED_BUNDLE_DIR = path.join(BUNDLE_CACHE_DIR, "bundle");
const BUNDLE_CACHE_VERSION = "2026-07-04-editor-export-v16-drop-designcombo";

function findLocalChromium(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.REMOTION_BROWSER_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function resolveLocalAssetPath(
  category: "media" | "audio",
  projectId: string,
  asset: { localPath?: string | null; r2Key?: string | null; r2Url?: string | null }
): string | null {
  if (asset.r2Url?.startsWith("http://") || asset.r2Url?.startsWith("https://")) {
    return null;
  }

  if (asset.localPath) {
    const absolutePath = path.isAbsolute(asset.localPath)
      ? asset.localPath
      : path.resolve(process.cwd(), asset.localPath);
    assertInsideStorage(absolutePath);
    return fs.existsSync(absolutePath) ? absolutePath : null;
  }

  const parsed = asset.r2Key ? parseStorageKey(asset.r2Key) : null;
  const fileName = parsed?.fileName;
  if (!fileName) return null;

  const resolvedCategory = (parsed?.category || category) as StorageCategoryType;
  const resolvedProjectId = parsed?.projectId || projectId;
  const absolutePath = filePath(resolvedCategory, resolvedProjectId, fileName);
  assertInsideStorage(absolutePath);

  return fs.existsSync(absolutePath) ? absolutePath : null;
}

function isVideoAsset(asset: { mimeType?: string | null; originalName?: string | null; localPath?: string | null }) {
  if (asset.mimeType?.startsWith("video/")) return true;
  const name = asset.originalName || asset.localPath || "";
  return /\.(mp4|mov|webm|avi|mkv)$/i.test(name);
}

async function createSilentVideoForRemotion(
  inputPath: string,
  outputPath: string
): Promise<string> {
  if (fs.existsSync(outputPath)) return outputPath;

  await runFfmpeg([
    "-i",
    inputPath,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  return outputPath;
}

async function createRenderAssetServer(
  assets: Map<string, string>
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const id = requestUrl.pathname.match(/^\/asset\/([^/]+)/)?.[1];
      const absolutePath = id ? assets.get(decodeURIComponent(id)) : null;

      if (!absolutePath || !fs.existsSync(absolutePath)) {
        res.writeHead(404).end();
        return;
      }

      const stat = fs.statSync(absolutePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      const contentType = mimeFromFileName(path.basename(absolutePath));

      if (range) {
        const [startRaw, endRaw] = range.replace(/bytes=/, "").split("-");
        const start = Number.parseInt(startRaw, 10);
        const end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;

        if (!Number.isFinite(start) || start >= fileSize) {
          res.writeHead(416, {
            "Content-Range": `bytes */${fileSize}`,
            "Accept-Ranges": "bytes",
          }).end();
          return;
        }

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        });
        const stream = fs.createReadStream(absolutePath, { start, end });
        stream.on("error", () => {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
        res.on("close", () => stream.destroy());
        stream.pipe(res);
        return;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      });
      const stream = fs.createReadStream(absolutePath);
      stream.on("error", () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      console.error("[export] Failed to serve render asset", error);
      res.writeHead(500).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to start render asset server");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/**
 * Remotion's own port picker starts probing at 3000 and its availability check
 * can pass while the Next.js dev server holds the port on the other IP stack —
 * headless Chrome then loads the Next 404 page instead of the bundle.
 * Grab a free ephemeral port ourselves and hand it to Remotion explicitly.
 */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = address && typeof address === "object" ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error("No free port"))));
    });
  });
}

/**
 * Fingerprint the source that feeds the Remotion bundle (its component tree +
 * the shared engine/adapters it imports). If any of it changes, the fingerprint
 * changes and the bundle is rebuilt — so editing the Compositor no longer
 * requires manually bumping BUNDLE_CACHE_VERSION to take effect on export.
 */
function bundleSourceFingerprint(): string {
  const roots = [
    path.resolve(process.cwd(), "src/remotion"),
    path.resolve(process.cwd(), "src/lib/engine"),
    path.resolve(process.cwd(), "src/lib/editor"),
    path.resolve(process.cwd(), "src/lib/subtitles"),
    path.resolve(process.cwd(), "src/fonts"),
  ];
  const hash = crypto.createHash("sha1");
  hash.update(BUNDLE_CACHE_VERSION);
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const stat = fs.statSync(full);
        hash.update(`${full}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  };
  for (const root of roots) walk(root);
  return hash.digest("hex");
}

async function getOrCreateBundle(): Promise<string> {
  const cachedIndex = path.join(CACHED_BUNDLE_DIR, "index.html");
  const cacheMarker = path.join(CACHED_BUNDLE_DIR, ".cache-version");
  const fingerprint = bundleSourceFingerprint();
  if (fs.existsSync(cachedIndex) && fs.existsSync(cacheMarker) && fs.readFileSync(cacheMarker, "utf-8") === fingerprint) {
    return CACHED_BUNDLE_DIR;
  }
  fs.mkdirSync(BUNDLE_CACHE_DIR, { recursive: true });

  const entryPoint = path.resolve(process.cwd(), "src/remotion/index.tsx");

  const bundled = await bundle({
    entryPoint,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...(config.resolve?.alias || {}),
          "@": path.resolve(process.cwd(), "src"),
        },
        fallback: {
          ...config.resolve?.fallback,
          fs: false,
          path: false,
          os: false,
        },
      },
    }),
  });

  if (fs.existsSync(bundled)) {
    if (fs.existsSync(CACHED_BUNDLE_DIR)) {
      fs.rmSync(CACHED_BUNDLE_DIR, { recursive: true });
    }
    fs.cpSync(bundled, CACHED_BUNDLE_DIR, { recursive: true });
    fs.writeFileSync(cacheMarker, fingerprint, "utf-8");
  }

  return bundled;
}

export async function renderProjectWithRemotion(options: {
  projectId: string;
  resolution?: string;
  format?: "mp4" | "webm";
  fps?: number;
  /** Live editor snapshot — takes priority over the DB timeline when provided. */
  timelineDoc?: TimelineDocument;
  onProgress: (pct: number) => void;
}): Promise<{ downloadUrl: string; fileSizeBytes: number; localPath: string } | null> {
  const { projectId, onProgress } = options;
  onProgress(5);

  const timeline = await prisma.timeline.findFirst({
    where: { projectId },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });

  let doc: TimelineDocument;
  if (options.timelineDoc) {
    // A live snapshot was explicitly provided — respect it exactly, even if
    // the user cleared every clip. Falling back to the DB timeline here
    // would silently re-render content the user just removed.
    doc = options.timelineDoc;
    console.log(`[export] Remotion using live editor snapshot (${Object.keys(doc.clips).length} clips)`);
  } else if (timeline) {
    doc = parseTimelineRow(timeline);
    console.log(`[export] Remotion using DB timeline (${Object.keys(doc.clips).length} clips)`);
  } else {
    return null;
  }
  const audio = await prisma.audioAsset.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const subtitle = await prisma.subtitleTrack.findFirst({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
  });
  const mediaRows = await prisma.mediaAsset.findMany({ where: { projectId } });
  const tempDir = projectDir(StorageCategory.TEMP, projectId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const localAssetPaths = new Map<string, string>();
  const localMediaPaths = new Map<string, string>();

  for (const media of mediaRows) {
    let localPath = resolveLocalAssetPath("media", projectId, media);
    if (!localPath) continue;

    if (isVideoAsset(media)) {
      localPath = await createSilentVideoForRemotion(
        localPath,
        path.join(tempDir, `remotion-silent-${media.id}.mp4`)
      );
    }

    const assetId = `media-${media.id}`;
    localAssetPaths.set(assetId, localPath);
    localMediaPaths.set(media.id, assetId);
  }

  const localAudioPath = audio ? resolveLocalAssetPath("audio", projectId, audio) : null;
  if (localAudioPath && audio) {
    localAssetPaths.set(`audio-${audio.id}`, localAudioPath);
  }

  const assetServer = await createRenderAssetServer(localAssetPaths);
  const renderAssetUrl = (id: string, absolutePath: string) =>
    `${assetServer.baseUrl}/asset/${encodeURIComponent(id)}/${encodeURIComponent(path.basename(absolutePath))}`;

  const mediaUrl = (media: (typeof mediaRows)[number]) => {
    if (media.r2Url?.startsWith("http://") || media.r2Url?.startsWith("https://")) return media.r2Url;

    const assetId = localMediaPaths.get(media.id);
    const localPath = assetId ? localAssetPaths.get(assetId) : null;
    return assetId && localPath ? renderAssetUrl(assetId, localPath) : media.r2Url || "";
  };

  const audioUrl = audio
    ? audio.r2Url?.startsWith("http://") || audio.r2Url?.startsWith("https://")
      ? audio.r2Url
      : localAudioPath
        ? renderAssetUrl(`audio-${audio.id}`, localAudioPath)
        : audio.r2Url || ""
    : "";

  try {

  const mediaById = new Map(
    mediaRows.map((m) => [
      m.id,
      {
        r2Url: mediaUrl(m),
        originalName: m.originalName || m.id,
        type: m.mimeType?.startsWith("video") ? "VIDEO" : "IMAGE",
        localPath: m.localPath,
      },
    ])
  );

  const originalCues = subtitle ? parseCuesJson(subtitle.cues) : [];
  const { cues: subtitleCues, style: timelineStyle } = getSubtitlesFromTimeline(doc, originalCues);

  const subtitleStyle = resolveSubtitleStyle(
    subtitle?.stylePreset || "instagram_reels",
    (timelineStyle || subtitle?.customStyle) as SubtitleStyle | null
  );

  onProgress(15);

  const elements = timelineDocumentToElements(doc, {
    mediaById,
    audio: audio
      ? {
          id: audio.id,
          r2Url: audioUrl,
          durationMs: audio.durationMs,
          localPath: audio.localPath,
        }
      : null,
    subtitleCues: subtitleCues.map((c) => ({
      id: c.id,
      startMs: c.startMs,
      endMs: c.endMs,
      text: c.text,
      words: c.words,
    })),
  });

  // Relative /api/storage/... URLs resolve against Remotion's bundle server inside
  // headless Chrome, not the Next.js app, so they 404 and elements silently vanish.
  // Rewrite them to the local render asset server.
  const apiStorageToAssetUrl = (url: string): string => {
    const match = url.match(/^\/api\/storage\/(media|audio|thumbnails)\/([^/]+)\/([^/?#]+)/);
    if (!match) return url;
    const localPath = filePath(
      match[1] as StorageCategoryType,
      match[2],
      decodeURIComponent(match[3])
    );
    if (!fs.existsSync(localPath)) return url;
    const assetId = `storage-${match[1]}-${match[2]}-${match[3]}`;
    if (!localAssetPaths.has(assetId)) localAssetPaths.set(assetId, localPath);
    return renderAssetUrl(assetId, localPath);
  };
  for (const el of elements) {
    if (el.mediaUrl?.startsWith("/api/storage/")) {
      el.mediaUrl = apiStorageToAssetUrl(el.mediaUrl);
    }
  }

  if (elements.length === 0) return null;

  const durationMs = Math.max(
    doc.settings.durationMs,
    ...elements.map((e) => e.endMs),
    subtitleCues.length > 0 ? subtitleCues[subtitleCues.length - 1].endMs : 0
  );

  onProgress(25);

  const loaded: LoadedProjectAssets = {
    media: mediaRows.map((m) => ({
      id: m.id,
      type: m.mimeType?.startsWith("video") ? "VIDEO" : "IMAGE",
      originalName: m.originalName || m.id,
      r2Url: mediaUrl(m),
      localPath: m.localPath,
      r2Key: m.r2Key || undefined,
    })),
    timeline: doc,
    timelineId: timeline?.id ?? "live-snapshot",
    subtitleCues,
    subtitleStyle,
    subtitleTrackId: subtitle?.id ?? null,
    elements,
    durationMs,
    warnings: [],
  };

  const [exportWidth, exportHeight] = (options.resolution ?? `${doc.settings.width}x${doc.settings.height}`)
    .split("x")
    .map(Number);

  const design: RenderDoc = projectAssetsToRenderDoc({
    projectId,
    loaded,
    aspect: { width: exportWidth, height: exportHeight },
  });

  onProgress(35);

  const browserExecutable = findLocalChromium();
  if (!browserExecutable) {
    console.warn(
      "[export] No local Chrome/Edge executable found for editor-accurate Remotion export. Falling back to FFmpeg."
    );
    return null;
  }

  const bundled = await getOrCreateBundle();

  onProgress(50);

  const format = options.format ?? "mp4";
  const outputLocation = path.join(tempDir, `remotion-output.${format}`);

  const fps = options.fps && options.fps > 0 ? options.fps : design.fps;
  const durationInFrames = Math.max(
    1,
    Math.round(((design.duration ?? 60000) / 1000) * fps)
  );

  await renderMedia({
    composition: {
      id: "export",
      width: design.size.width,
      height: design.size.height,
      fps,
      durationInFrames,
      defaultProps: {},
      props: {},
      defaultCodec: null,
      defaultOutName: null,
      defaultVideoImageFormat: null,
      defaultPixelFormat: null,
      defaultProResProfile: null,
      defaultSampleRate: null,
    },
    serveUrl: bundled,
    browserExecutable,
    codec: format === "webm" ? "vp8" : "h264",
    outputLocation,
    // Let Remotion mix ALL audio natively (video-clip sound honouring each
    // clip's mute/volume + the voiceover Audio track) instead of muxing only
    // the voiceover afterwards. `muted: false` keeps that audio.
    muted: false,
    enforceAudioTrack: true,
    port: await getFreePort(),
    concurrency: Math.max(2, Math.floor(os.cpus().length / 2)),
    timeoutInMilliseconds: 120_000,
    inputProps: {
      // Pass the FULL item map (incl. audio) so <Audio>/<OffthreadVideo> render.
      trackItemIds: design.trackItemIds,
      trackItemsMap: design.trackItemsMap,
      transitionsMap: design.transitionsMap,
      tracks: design.tracks,
      duration: design.duration,
      background: design.background,
    },
    onProgress: ({ progress }) => {
      onProgress(50 + Math.round(progress * 40));
    },
  });

  onProgress(90);

  const buffer = fs.readFileSync(outputLocation);
  const fileName = `export-${Date.now()}.${format}`;
  const saved = await saveBufferAsync(StorageCategory.EXPORTS, projectId, fileName, buffer);

  onProgress(100);

  return {
    downloadUrl: saved.url,
    fileSizeBytes: saved.sizeBytes,
    localPath: saved.localPath,
  };
} finally {
  await assetServer.close();
}
}
