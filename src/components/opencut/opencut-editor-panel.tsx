"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Download, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadProjectAssets } from "@/lib/editor/load-project-assets";
import {
  generatedAssetsToOpenCutProject,
  openCutProjectToTimelineDocument,
} from "@/opencut/generated-assets-mapper";
import type { AudioAsset } from "@/types";
import type { OpenCutProject, OpenCutTimelineElement } from "@/opencut/types";

type SnapshotRequest = {
  resolve: (project: OpenCutProject | null) => void;
  timeoutId: number;
};

type UploadedMediaAsset = {
  id: string;
  r2Url: string;
  thumbnailUrl?: string | null;
};

export function OpenCutEditorPanel({
  projectId,
  projectTitle,
  audio,
  onBackToSubtitles,
}: {
  projectId: string;
  projectTitle: string;
  audio: AudioAsset | null;
  onBackToSubtitles?: () => void;
}) {
  const [projectData, setProjectData] = useState<OpenCutProject | null>(null);
  const [editorReady, setEditorReady] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("opencut-autosave") === "true";
  });
  const snapshotRequestsRef = useRef(new Map<string, SnapshotRequest>());
  const uploadedMediaRef = useRef(new Map<string, UploadedMediaAsset>());
  const uploadPromisesRef = useRef(new Map<string, Promise<UploadedMediaAsset>>());
  const saveProjectRef = useRef(saveProject);
  const autosaveTimerRef = useRef<number | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    saveProjectRef.current = saveProject;
  });

  useEffect(() => {
    async function load() {
      try {
        uploadedMediaRef.current.clear();
        uploadPromisesRef.current.clear();
        hasLoadedRef.current = false;
        const loaded = await loadProjectAssets({
          projectId,
          audio: audio
            ? {
                id: audio.id,
                r2Url: audio.r2Url,
                durationMs: audio.durationMs,
                waveformData: audio.waveformData ?? undefined,
              }
            : null,
        });

        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const absoluteLoaded = {
          ...loaded,
          media: loaded.media.map((m) => ({
            ...m,
            r2Url: m.r2Url && m.r2Url.startsWith("/") ? `${origin}${m.r2Url}` : m.r2Url,
          })),
        };

        const absoluteAudio = audio
          ? {
              id: audio.id,
              r2Url: audio.r2Url && audio.r2Url.startsWith("/") ? `${origin}${audio.r2Url}` : audio.r2Url,
              durationMs: audio.durationMs,
              waveformData: audio.waveformData ?? undefined,
            }
          : null;

        const openCutProj = generatedAssetsToOpenCutProject({
          projectId,
          projectTitle,
          loaded: absoluteLoaded,
          audio: absoluteAudio,
        });
        setProjectData(openCutProj);
      } catch (e) {
        console.error("Failed to load project assets:", e);
      }
    }
    void load();
  }, [audio, projectId, projectTitle]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "EDITOR_READY") {
        hasLoadedRef.current = false;
        setEditorReady(Date.now());
      }
      if (
        event.data &&
        (event.data.type === "PROJECT_UPDATED" ||
          event.data.type === "PROJECT_CHANGED" ||
          event.data.type === "SAVE_PROJECT") &&
        event.data.project
      ) {
        setProjectData(event.data.project);
        if (autosaveEnabled) {
          if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = window.setTimeout(() => {
            void saveProjectRef.current(event.data.project, true);
          }, 1200);
        }
      }
      if (event.data && event.data.type === "PROJECT_SNAPSHOT") {
        const request = snapshotRequestsRef.current.get(event.data.requestId);
        if (request) {
          window.clearTimeout(request.timeoutId);
          snapshotRequestsRef.current.delete(event.data.requestId);
          request.resolve(event.data.project ?? null);
        }
      }
      if (event.data && event.data.type === "EXPORT_PROGRESS") {
        setExportProgress(Math.max(0, Math.min(100, Number(event.data.progress) || 0)));
      }
      if (event.data && event.data.type === "EXPORT_DONE") {
        setExporting(false);
        setExportProgress(100);
        setMessage("Export downloaded");
      }
      if (event.data && event.data.type === "EXPORT_ERROR") {
        setExporting(false);
        setMessage(event.data.error || "Export failed");
      }
      if (event.data && event.data.type === "EXPORT_CANCELLED") {
        setExporting(false);
        setMessage("Export cancelled");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [autosaveEnabled]);

  useEffect(() => {
    window.localStorage.setItem("opencut-autosave", String(autosaveEnabled));
  }, [autosaveEnabled]);

  useEffect(() => {
    const snapshotRequests = snapshotRequestsRef.current;
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      snapshotRequests.forEach((request) => {
        window.clearTimeout(request.timeoutId);
        request.resolve(null);
      });
      snapshotRequests.clear();
    };
  }, []);

  useEffect(() => {
    if (editorReady > 0 && projectData && !hasLoadedRef.current) {
      const iframe = document.getElementById("opencut-iframe") as HTMLIFrameElement | null;
      if (iframe && iframe.contentWindow) {
        hasLoadedRef.current = true;
        iframe.contentWindow.postMessage(
          {
            type: "LOAD_PROJECT",
            project: projectData,
          },
          "*"
        );
      }
    }
  }, [editorReady, projectData]);

  function requestLatestProject() {
    const iframe = document.getElementById("opencut-iframe") as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return Promise.resolve(projectData);

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise<OpenCutProject | null>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        snapshotRequestsRef.current.delete(requestId);
        resolve(projectData);
      }, 2000);

      snapshotRequestsRef.current.set(requestId, { resolve, timeoutId });
      iframe.contentWindow?.postMessage({ type: "REQUEST_PROJECT_SNAPSHOT", requestId }, "*");
    });
  }

  function getProjectScopedMediaId(mediaId: string) {
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeMediaId = mediaId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (safeMediaId.startsWith(`${safeProjectId}-`)) return safeMediaId;
    return `${safeProjectId}-${safeMediaId}`.slice(0, 80);
  }

  function normalizeImportedMediaIds(project: OpenCutProject): OpenCutProject {
    const idMap = new Map<string, string>();
    const media = project.media.map((item) => {
      const hasLocalFile = !!(item as OpenCutProject["media"][number] & { file?: File }).file;
      const isUnsavedBlob = item.url?.startsWith("blob:") || item.url?.startsWith("data:");
      if (!hasLocalFile && !isUnsavedBlob) return item;

      const nextId = getProjectScopedMediaId(item.id);
      if (nextId !== item.id) idMap.set(item.id, nextId);
      return { ...item, id: nextId };
    });

    if (idMap.size === 0) return project;

    const remapElement = (element: OpenCutTimelineElement): OpenCutTimelineElement => {
      if ("mediaId" in element && idMap.has(element.mediaId)) {
        return { ...element, mediaId: idMap.get(element.mediaId) };
      }
      return element;
    };

    return {
      ...project,
      media,
      scene: {
        ...project.scene,
        tracks: {
          main: {
            ...project.scene.tracks.main,
            elements: project.scene.tracks.main.elements.map(remapElement),
          },
          overlay: project.scene.tracks.overlay.map((track) => ({
            ...track,
            elements: track.elements.map(remapElement),
          })),
          audio: project.scene.tracks.audio.map((track) => ({
            ...track,
            elements: track.elements.map(remapElement),
          })),
        },
      },
    };
  }

  async function thumbnailFileFromUrl(url?: string | null) {
    if (!url || (!url.startsWith("blob:") && !url.startsWith("data:"))) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.size) return null;
      return new File([blob], "thumbnail.jpg", { type: blob.type || "image/jpeg" });
    } catch {
      return null;
    }
  }

  async function uploadImportedMedia(project: OpenCutProject) {
    for (const media of project.media) {
      const file = (media as OpenCutProject["media"][number] & { file?: File }).file;
      if (!file || !media.url?.startsWith("blob:")) continue;
      if (uploadedMediaRef.current.has(media.id)) continue;

      const existingUpload = uploadPromisesRef.current.get(media.id);
      if (existingUpload) {
        await existingUpload;
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientMediaId", media.id);
      const thumbnail = await thumbnailFileFromUrl(media.thumbnailUrl);
      if (thumbnail) formData.append("thumbnail", thumbnail);

      const uploadPromise = fetch(`/api/projects/${projectId}/media`, {
        method: "POST",
        body: formData,
      }).then(async (res) => {
        if (!res.ok) throw new Error(`Could not save imported media: ${media.name}`);
        const json = await res.json() as { mediaAsset: UploadedMediaAsset };
        uploadedMediaRef.current.set(media.id, json.mediaAsset);
        return json.mediaAsset;
      }).finally(() => {
        uploadPromisesRef.current.delete(media.id);
      });

      uploadPromisesRef.current.set(media.id, uploadPromise);
      await uploadPromise;
    }
  }

  function withUploadedMediaUrls(project: OpenCutProject): OpenCutProject {
    let changed = false;
    const media = project.media.map((item) => {
      const uploaded = uploadedMediaRef.current.get(item.id);
      if (!uploaded) return item;
      changed = true;
      return {
        ...item,
        url: uploaded.r2Url,
        thumbnailUrl: uploaded.thumbnailUrl ?? item.thumbnailUrl,
      };
    });
    return changed ? { ...project, media } : project;
  }

  async function deleteRemovedServerMedia(project: OpenCutProject) {
    const response = await fetch(`/api/projects/${projectId}/media`, { cache: "no-store" });
    if (!response.ok) return;

    const json = await response.json() as { media: Array<{ id: string }> };
    const currentIds = new Set(project.media.filter((media) => media.type !== "audio").map((media) => media.id));
    await Promise.all(
      (json.media ?? [])
        .filter((media) => !currentIds.has(media.id))
        .map((media) =>
          fetch(`/api/projects/${projectId}/media?mediaId=${encodeURIComponent(media.id)}`, {
            method: "DELETE",
          }).then((res) => {
            if (!res.ok && res.status !== 404) {
              throw new Error("Could not delete removed media");
            }
          })
        )
    );
  }

  async function saveProject(projectOverride?: OpenCutProject | null, isAutosave = false) {
    const latestProject = projectOverride ?? await requestLatestProject();
    if (!latestProject) return false;
    if (!isAutosave) setSaving(true);
    if (!isAutosave) setMessage(null);
    try {
      const normalizedProject = normalizeImportedMediaIds(latestProject);
      await uploadImportedMedia(normalizedProject);
      const project = withUploadedMediaUrls(normalizedProject);
      await deleteRemovedServerMedia(project);
      const doc = openCutProjectToTimelineDocument(project);
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...doc, isAutosave, bumpVersion: false }),
      });
      if (!res.ok) throw new Error("Could not save timeline");
      setProjectData(project);
      setMessage(isAutosave ? "Autosaved" : "Saved");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
      return false;
    } finally {
      if (!isAutosave) setSaving(false);
    }
  }

  async function exportVideo() {
    const saved = await saveProject();
    if (!saved) return;
    const iframe = document.getElementById("opencut-iframe") as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) {
      setMessage("Editor is not ready");
      return;
    }

    setExporting(true);
    setExportProgress(0);
    setMessage(null);
    iframe.contentWindow.postMessage(
      {
        type: "EXPORT_PROJECT",
        options: { format: "mp4", quality: "high", includeAudio: true },
      },
      "*"
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] h-screen w-screen bg-slate-950 text-white shadow-2xl">
      {onBackToSubtitles && (
        <button
          onClick={onBackToSubtitles}
          className="absolute top-2.5 left-2.5 z-[10000] h-8 bg-slate-900 hover:bg-slate-800 text-white rounded-md flex items-center gap-1.5 px-3 text-xs border border-white/10 shadow-md font-medium transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </button>
      )}
      <div className="absolute top-2.5 right-2.5 z-[10000] flex items-center gap-2 rounded-md border border-white/10 bg-slate-900/95 p-1.5 shadow-md">
        {message && <span className="px-2 text-xs text-slate-200">{message}</span>}
        {exporting && (
          <span className="px-2 text-xs text-slate-200">{Math.round(exportProgress)}%</span>
        )}
        <Button
          size="sm"
          variant={autosaveEnabled ? "default" : "secondary"}
          onClick={() => setAutosaveEnabled((enabled) => !enabled)}
          className="h-8 text-xs"
        >
          Autosave {autosaveEnabled ? "On" : "Off"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void saveProject()} disabled={saving || !projectData} className="h-8 text-xs">
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
          Save
        </Button>
        <Button size="sm" onClick={exportVideo} disabled={saving || exporting || !projectData} className="h-8 text-xs">
          {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
          Export
        </Button>
      </div>
      <iframe
        id="opencut-iframe"
        src={`/editor/${projectId}`}
        className="w-full h-full border-none"
        title="OpenCut Editor"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
