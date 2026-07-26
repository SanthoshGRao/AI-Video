/**
 * ipc.ts — IPC handlers for the native editor window. Registered once at
 * app boot (see main.ts). All DB/filesystem access happens here in the
 * main process; the editor renderer never touches Postgres or `fs`
 * directly (contextIsolation/nodeIntegration:false stays intact).
 */

import { ipcMain, BrowserWindow } from "electron";
import { getProject } from "./data/projects.repo";
import { getLatestTimeline, saveTimeline } from "./data/timelines.repo";
import { getMediaAsset, listMediaAssetsForProject } from "./data/media-assets.repo";
import { listAudioAssetsForProject } from "./data/audio-assets.repo";
import { listSubtitleTracksForProject } from "./data/subtitle-tracks.repo";
import { createExportJob, getExportJob } from "./data/export-jobs.repo";
import { toMediaUrl } from "./protocols";
import { fromTimelineDocument, toTimelineDocument } from "./model/legacy-adapter";
import { emptyNativeProject, type NativeProject } from "./model/types";
import type { TimelineDocument } from "./model/legacy-types";
import { runExport, cancelExport } from "./export/export-runner";
import type { ExportOptions } from "./export/export-types";
import { getOrGenerateThumbnail } from "./media/thumbnail-gen";
import { probeMedia } from "./media/probe";
import { clearSnapshot, isSnapshotNewer, readSnapshot, writeSnapshot } from "./recovery/snapshot";
import { logger } from "./diagnostics/logger";

/** Cache of the last-loaded TimelineDocument per project, used as the
 * `base` for toTimelineDocument() so settings/textLayers extras the
 * NativeProject model doesn't carry survive a save. */
const lastLoadedDoc = new Map<string, TimelineDocument>();

/** projectId -> in-flight export job id, so a second export can't be
 * started for the same project while one is already rendering (which
 * would otherwise race both ffmpeg processes against the same output
 * directory and progress-reporting channel). */
const activeExportByProject = new Map<string, string>();

export function registerEditorIpc(): void {
  ipcMain.handle("editor:load", async (_event, projectId: string) => {
    const project = await getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const [timelineRow, mediaAssets, audioAssets, subtitleTracks] = await Promise.all([
      getLatestTimeline(projectId),
      listMediaAssetsForProject(projectId),
      listAudioAssetsForProject(projectId),
      listSubtitleTracksForProject(projectId),
    ]);

    let nativeProject: NativeProject;
    if (timelineRow) {
      const doc: TimelineDocument = {
        tracks: timelineRow.tracks as TimelineDocument["tracks"],
        clips: timelineRow.clips as TimelineDocument["clips"],
        transitions: (timelineRow.transitions as TimelineDocument["transitions"]) ?? [],
        textLayers: (timelineRow.textLayers as TimelineDocument["textLayers"]) ?? [],
        settings: timelineRow.settings as TimelineDocument["settings"],
      };
      lastLoadedDoc.set(projectId, doc);
      nativeProject = fromTimelineDocument(timelineRow.id, projectId, timelineRow.version, doc);
    } else {
      nativeProject = emptyNativeProject(`draft-${projectId}`, projectId);
    }

    const snapshot = readSnapshot(projectId);
    const recoverySnapshot =
      snapshot && isSnapshotNewer(snapshot, timelineRow?.version ?? 0, timelineRow?.createdAt ?? new Date(0).toISOString())
        ? snapshot.project
        : null;
    if (recoverySnapshot) {
      logger.info("data", "Recovery snapshot newer than DB timeline — offering restore", { projectId });
    }

    return {
      project: { id: project.id, title: project.title, language: project.language },
      timeline: nativeProject,
      recoverySnapshot,
      media: mediaAssets.map((m) => ({
        id: m.id,
        type: m.type,
        originalName: m.originalName,
        url: m.localPath ? toMediaUrl(m.localPath) : null,
        width: m.width,
        height: m.height,
        durationMs: m.durationMs,
        mimeType: m.mimeType,
      })),
      audio: audioAssets.map((a) => ({
        id: a.id,
        voiceType: a.voiceType,
        url: a.localPath ? toMediaUrl(a.localPath) : null,
        durationMs: a.durationMs,
        waveformData: a.waveformData,
      })),
      subtitles: subtitleTracks,
      subtitleTrackId: (timelineRow?.settings as { subtitleTrackId?: string } | null)?.subtitleTrackId ?? null,
    };
  });

  ipcMain.handle(
    "editor:save",
    async (
      _event,
      args: { projectId: string; timeline: NativeProject; isAutosave: boolean; bumpVersion: boolean }
    ) => {
      const base = lastLoadedDoc.get(args.projectId);
      const doc = toTimelineDocument(args.timeline, base);

      const row = await saveTimeline(args.projectId, {
        tracks: doc.tracks,
        clips: doc.clips,
        transitions: doc.transitions,
        textLayers: doc.textLayers,
        settings: doc.settings,
        isAutosave: args.isAutosave,
        bumpVersion: args.bumpVersion,
      });
      lastLoadedDoc.set(args.projectId, doc);
      clearSnapshot(args.projectId);

      return { timelineId: row.id, version: row.version };
    }
  );

  ipcMain.on(
    "editor:recovery:snapshot",
    (_event, args: { projectId: string; timeline: NativeProject; timelineVersion: number }) => {
      writeSnapshot(args.projectId, args.timeline, args.timelineVersion);
    }
  );

  ipcMain.handle("editor:export:start", async (event, options: ExportOptions) => {
    const existingJobId = activeExportByProject.get(options.projectId);
    if (existingJobId) {
      throw new Error("An export is already running for this project — wait for it to finish or cancel it first.");
    }

    const job = await createExportJob({
      projectId: options.projectId,
      format: options.format,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      subtitleBurnIn: options.subtitleBurnIn,
    });
    activeExportByProject.set(options.projectId, job.id);

    const win = BrowserWindow.fromWebContents(event.sender);
    void runExport(job.id, options, (progress) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("editor:export:progress", job.id, progress);
      }
    }).finally(() => {
      if (activeExportByProject.get(options.projectId) === job.id) {
        activeExportByProject.delete(options.projectId);
      }
    });

    return { jobId: job.id };
  });

  ipcMain.handle("editor:export:status", async (_event, jobId: string) => {
    return getExportJob(jobId);
  });

  ipcMain.handle("editor:export:cancel", (_event, jobId: string) => {
    return cancelExport(jobId);
  });

  /**
   * Bridge for the OLD editor-v2 UI (Web Application/src/components/editor-v2),
   * which keeps its own UI/data model and save path entirely unchanged.
   * Only the Export button's backend swaps: the old editor already builds a
   * TimelineDocument snapshot client-side (getEditorTimelineSnapshot) the
   * same shape it saves to the DB — fromTimelineDocument() converts that
   * straight into a NativeProject for the new hardware-accelerated ffmpeg
   * engine, no separate native editor UI involved. Progress/download reuse
   * the EXISTING ExportJob row + GET /api/projects/[id]/export/[jobId]
   * polling route unchanged, since this writes to the same `export_jobs`
   * table (see exportDownloadUrl() in export-runner.ts for the matching
   * downloadUrl format).
   */
  ipcMain.handle(
    "editor:export:legacy",
    async (
      _event,
      args: {
        projectId: string;
        timeline: TimelineDocument;
        format: "mp4" | "mov" | "webm";
        resolution: string;
        aspectRatio: string;
        subtitleBurnIn: boolean;
        fps?: number;
      }
    ) => {
      if (activeExportByProject.has(args.projectId)) {
        throw new Error("An export is already running for this project — wait for it to finish or cancel it first.");
      }

      const nativeProject = fromTimelineDocument(`legacy-export-${Date.now()}`, args.projectId, 0, args.timeline);
      if (args.fps) nativeProject.fps = args.fps;

      const job = await createExportJob({
        projectId: args.projectId,
        format: args.format,
        aspectRatio: args.aspectRatio,
        resolution: args.resolution,
        subtitleBurnIn: args.subtitleBurnIn,
      });
      activeExportByProject.set(args.projectId, job.id);

      void runExport(
        job.id,
        {
          projectId: args.projectId,
          format: args.format,
          aspectRatio: args.aspectRatio,
          resolution: args.resolution,
          subtitleBurnIn: args.subtitleBurnIn,
          subtitleTrackId: args.timeline.settings?.subtitleTrackId,
          project: nativeProject,
        },
        () => {}
      ).finally(() => {
        if (activeExportByProject.get(args.projectId) === job.id) {
          activeExportByProject.delete(args.projectId);
        }
      });

      return { job: { id: job.id } };
    }
  );

  ipcMain.handle("editor:media:thumbnail", async (_event, mediaAssetId: string) => {
    const asset = await getMediaAsset(mediaAssetId);
    if (!asset?.localPath) return null;
    try {
      const path = await getOrGenerateThumbnail(
        mediaAssetId,
        asset.localPath,
        asset.type.toLowerCase().includes("video"),
        asset.durationMs
      );
      return toMediaUrl(path);
    } catch (err) {
      console.warn(`[ipc] Thumbnail generation failed for ${mediaAssetId}:`, err);
      return null;
    }
  });

  ipcMain.handle("editor:media:probe", async (_event, filePath: string) => {
    return probeMedia(filePath);
  });
}
