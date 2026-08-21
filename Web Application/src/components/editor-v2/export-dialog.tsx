"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { Download, FileVideo, CheckCircle2, Film, Layers, MonitorPlay, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { exportResolutionForAspect, getEditorTimelineSnapshot, saveEditorTimeline } from "@/lib/editor-v2/timeline-sync";
import { loadExportDefaults } from "@/lib/export-defaults";
import { cancelExportJob } from "@/lib/editor-v2/export-control";
import { useDesktopShell } from "@/hooks/use-desktop-shell";
import { useState, useEffect, useRef, useMemo } from "react";

type ResolutionTier = "720" | "1080";
type ExportFormat = "mp4" | "webm";

export function ExportDialog({
  projectId = "",
  projectTitle,
}: {
  projectId?: string;
  projectTitle?: string;
}) {
  const { exportOpen, setExportOpen, projectName, aspect, elements, clips, settings, setSetting, background, tracks, transitions, setExportRun, setExportEditWarning, exportStatus: storeStatus, exportJobId: storeJobId } = useEditor();
  const isDesktop = useDesktopShell();
  const routeParams = useParams() as { id?: string };
  const id = projectId || routeParams.id || "";
  const displayName = projectTitle || projectName;

  const [exportId, setExportId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"IDLE" | "RENDERING" | "COMPLETED" | "FAILED">("IDLE");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [resolutionTier, setResolutionTier] = useState<ResolutionTier>(
    () => loadExportDefaults().resolution
  );
  const [format, setFormat] = useState<ExportFormat>(
    () => loadExportDefaults().format
  );
  const [subtitleBurnIn, setSubtitleBurnIn] = useState(
    () => loadExportDefaults().subtitleBurnIn
  );
  const [downloadTriggered, setDownloadTriggered] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  /**
   * Set the moment the user asks to stop. A poll already in flight can still
   * come back DONE, and without this the completed branch would fire an
   * auto-download for the export they just cancelled.
   */
  const cancelRequested = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const renderStartedAt = useRef<number | null>(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [phase, setPhase] = useState("Preparing export…");

  useEffect(() => {
    if (status === "RENDERING" && renderStartedAt.current == null) {
      renderStartedAt.current = Date.now();
    }
    if (status === "IDLE" || status === "FAILED") {
      renderStartedAt.current = null;
      setDisplayProgress(0);
      setPhase("Preparing export…");
    }
  }, [status]);

  useEffect(() => {
    setDisplayProgress((prev) => Math.max(prev, progress));
    if (progress < 15) setPhase("Saving timeline & loading assets…");
    else if (progress < 50) setPhase("Bundling renderer…");
    else if (progress < 80) setPhase("Rendering frames…");
    else if (progress < 100) setPhase("Encoding video…");
    else setPhase("Finalizing…");
  }, [progress]);

  const etaSeconds = useMemo(() => {
    if (displayProgress < 3 || !renderStartedAt.current) return null;
    const elapsed = (Date.now() - renderStartedAt.current) / 1000;
    const remaining = (elapsed / displayProgress) * (100 - displayProgress);
    return Number.isFinite(remaining) ? Math.max(0, Math.round(remaining)) : null;
  }, [displayProgress, progress]);

  useEffect(() => {
    if (!exportId || status === "COMPLETED" || status === "FAILED") return;

    const MAX_CONSECUTIVE_FAILURES = 10; // ~8s of failures at 800ms/poll
    let consecutiveFailures = 0;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/projects/${id}/export/${exportId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch export status");
        const data = await res.json();
        consecutiveFailures = 0;
        // The user asked to stop while this request was in flight — the reset
        // has already happened, so anything this poll says is stale.
        if (cancelRequested.current) return;

        if (data.job) {
          setProgress(data.job.renderProgress ?? 0);

          let nextStatus: "IDLE" | "RENDERING" | "COMPLETED" | "FAILED" = "RENDERING";
          if (data.job.status === "DONE") {
            nextStatus = "COMPLETED";
          } else if (data.job.status === "FAILED") {
            nextStatus = "FAILED";
          }

          setStatus(nextStatus);

          if (data.job.downloadUrl) {
            setDownloadUrl(data.job.downloadUrl);

            if (nextStatus === "COMPLETED" && !downloadTriggered) {
              setDownloadTriggered(true);
              const link = document.createElement("a");
              link.href = data.job.downloadUrl;
              link.download = displayName ? `${displayName}.${format}` : `video.${format}`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              toast.success("Download started automatically!", { id: "export" });
            }
          }

          if (nextStatus === "FAILED" && data.job.errorMessage) {
            toast.error(data.job.errorMessage, { id: "export" });
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          setStatus("FAILED");
          toast.error(
            "Lost connection while checking export progress. Please try exporting again.",
            { id: "export" }
          );
          if (pollInterval) clearInterval(pollInterval);
        }
      }
    };

    void poll();
    pollInterval = setInterval(poll, 800);
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [exportId, id, status, downloadTriggered, displayName, format]);

  /** Back to a clean "ready to export" panel. */
  const resetRun = () => {
    setExportId(null);
    setProgress(0);
    setDisplayProgress(0);
    setDownloadUrl(null);
    setDownloadTriggered(false);
    setStatus("IDLE");
  };

  const wasOpen = useRef(false);
  useEffect(() => {
    const justOpened = exportOpen && !wasOpen.current;
    wasOpen.current = exportOpen;
    // Reopening after a finished run starts clean, so the next Export click
    // renders again and shows progress instead of re-offering the previous
    // file's download button. A run still in flight is left alone — reopening
    // then shows its live progress, which is the point.
    if (!justOpened || statusRef.current === "RENDERING") return;
    cancelRequested.current = false;
    setCancelling(false);
    resetRun();
  }, [exportOpen]);

  // Mirror the run out to the store so the rest of the editor can see it —
  // markDirty() uses it to warn when the timeline is edited mid-render.
  useEffect(() => {
    setExportRun(status, exportId);
  }, [status, exportId, setExportRun]);

  // …and follow it back the other way when something outside this dialog stops
  // the run ("Stop export & edit" in export-edit-warning.tsx), so the poll loop
  // tears down instead of reporting the cancelled job as a failure.
  useEffect(() => {
    // `exportId` must be set before this counts: between clicking Export and
    // the job id coming back, the mirrored store values this render closed over
    // are still the previous run's — which would otherwise look like a stop.
    if (exportId && status === "RENDERING" && storeStatus === "IDLE" && storeJobId === null) {
      cancelRequested.current = true;
      resetRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeStatus, storeJobId, status, exportId]);

  const stopExport = async () => {
    if (!id || !exportId) {
      resetRun();
      return;
    }
    setCancelling(true);
    cancelRequested.current = true;
    try {
      await cancelExportJob(id, exportId);
      resetRun();
      setExportEditWarning(false);
      toast.info("Export stopped.", { id: "export" });
    } catch (err) {
      cancelRequested.current = false;
      toast.error(err instanceof Error ? err.message : "Failed to stop the export.", { id: "export" });
    } finally {
      setCancelling(false);
    }
  };

  const triggerDownload = async () => {
    if (!id) {
      toast.error("Project ID missing — cannot export.");
      return;
    }
    try {
      cancelRequested.current = false;
      setStatus("RENDERING");
      setProgress(0);
      setDisplayProgress(0);
      setExportId(null);
      setDownloadUrl(null);
      setDownloadTriggered(false);
      toast.loading("Saving timeline...", { id: "export" });
      await saveEditorTimeline(id, false);
      const timelineSnapshot = getEditorTimelineSnapshot({
        aspect,
        background,
        clips,
        elements,
        tracks,
        transitions,
        settings,
      });
      toast.loading("Starting export...", { id: "export" });
      const resolution = exportResolutionForAspect(aspect, resolutionTier);

      // Desktop app: render with the native hardware-accelerated ffmpeg
      // engine instead of Remotion. Same job-row shape either way, so the
      // polling effect below doesn't need to know which path ran.
      const data =
        isDesktop && window.desktopAPI?.exportNative
          ? await window.desktopAPI.exportNative({
              projectId: id,
              timeline: timelineSnapshot,
              resolution,
              aspectRatio: aspect,
              format,
              subtitleBurnIn,
              fps: settings.fps,
            })
          : await (async () => {
              const res = await fetch(`/api/projects/${id}/export`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  resolution,
                  aspectRatio: aspect,
                  format,
                  subtitleBurnIn,
                  fps: settings.fps,
                  timeline: timelineSnapshot,
                }),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Export failed");
              }
              return res.json();
            })();

      if (data.job) {
        setExportId(data.job.id);
        toast.success("Export started! Rendering in progress.", { id: "export" });
      }
    } catch (err) {
      console.error(err);
      setStatus("FAILED");
      toast.error(err instanceof Error ? err.message : "Failed to start export.", { id: "export" });
    }
  };

  return (
    <Dialog
      open={exportOpen}
      onOpenChange={(open) => {
        if (!open && status === "RENDERING") {
          toast.info("Export will continue in the background.");
        }
        setExportOpen(open);
      }}
    >
      <DialogContent aria-describedby={undefined} className="sm:max-w-md bg-zinc-950/80 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden p-0 rounded-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-white/5">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-white tracking-tight">
            <FileVideo className="size-5 text-indigo-400" /> Export &quot;{displayName}&quot;
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col">
          <div className="p-6 pb-4 space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Pill label="Clips" value={String(clips.length)} icon={Film} />
              <Pill label="Elements" value={String(elements.length)} icon={Layers} />
              <Pill label="Aspect" value={aspect} icon={MonitorPlay} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <OptionGroup label="Resolution">
                <select
                  value={resolutionTier}
                  onChange={(e) => setResolutionTier(e.target.value as ResolutionTier)}
                  className="w-full h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-sm text-zinc-100"
                >
                  <option value="1080">1080p ({exportResolutionForAspect(aspect, "1080")})</option>
                  <option value="720">720p ({exportResolutionForAspect(aspect, "720")})</option>
                </select>
              </OptionGroup>
              <OptionGroup label="Frame rate">
                <select
                  value={settings.fps}
                  onChange={(e) => setSetting("fps", Number(e.target.value) as 24 | 30 | 60)}
                  className="w-full h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-sm text-zinc-100"
                >
                  <option value={24}>24 fps</option>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </OptionGroup>
              <OptionGroup label="Format">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ExportFormat)}
                  className="w-full h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-sm text-zinc-100"
                >
                  <option value="mp4">MP4 (H.264)</option>
                  <option value="webm">WebM</option>
                </select>
              </OptionGroup>
              <OptionGroup label="Subtitles">
                <label className="flex items-center gap-2 h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-sm text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={subtitleBurnIn}
                    onChange={(e) => setSubtitleBurnIn(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  Burn into video
                </label>
              </OptionGroup>
            </div>
          </div>

          <div className="border-t border-white/5 bg-white/[0.02]">
            {status === "IDLE" || status === "FAILED" ? (
              <div className="p-6 flex flex-col items-center justify-center space-y-5">
                <p className="text-sm text-zinc-400 text-center max-w-[320px] leading-relaxed">
                  Export saves your timeline, then renders on our servers with the settings above.
                </p>
                <button
                  onClick={triggerDownload}
                  className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                >
                  <Download className="size-4" /> {status === "FAILED" ? "Retry Export" : "Export Video"}
                </button>
              </div>
            ) : status === "RENDERING" ? (
              <div className="p-8 flex flex-col items-center justify-center space-y-6">
                <div className="relative flex items-center justify-center w-20 h-20">
                  <div
                    className="absolute inset-0 rounded-full border-2 border-indigo-500/20"
                    style={{ animation: "export-spin 2s linear infinite" }}
                  />
                  <svg className="absolute inset-0 w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="url(#exportGrad)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={`${2 * Math.PI * 34 * (1 - displayProgress / 100)}`}
                      style={{ transition: "stroke-dashoffset 0.4s ease" }}
                    />
                    <defs>
                      <linearGradient id="exportGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="relative z-10 text-sm font-semibold text-white tabular-nums">
                    {Math.round(displayProgress)}%
                  </span>
                </div>
                <div className="space-y-1.5 w-full text-center">
                  <p className="text-sm font-medium text-white">{phase}</p>
                  <p className="text-xs text-zinc-500">
                    {etaSeconds != null && displayProgress > 2 && displayProgress < 100
                      ? `About ${etaSeconds >= 60 ? `${Math.ceil(etaSeconds / 60)} min` : `${etaSeconds}s`} remaining`
                      : "This may take a few minutes for longer videos"}
                  </p>
                </div>
                <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden shadow-inner">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.max(3, displayProgress)}%`,
                      background: "linear-gradient(90deg, #6366f1, #818cf8, #a5b4fc)",
                      animation: displayProgress < 5 ? "export-pulse 1.5s ease-in-out infinite" : undefined,
                    }}
                  />
                </div>
                <button
                  onClick={stopExport}
                  disabled={cancelling}
                  className="w-full h-10 rounded-xl bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-sm font-medium text-zinc-300 hover:text-red-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="size-4" /> {cancelling ? "Stopping…" : "Stop export"}
                </button>
                <style>{`
                  @keyframes export-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                  @keyframes export-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
                `}</style>
              </div>
            ) : status === "COMPLETED" ? (
              <div className="p-8 flex flex-col items-center justify-center space-y-6">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <CheckCircle2 className="size-7 text-emerald-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-base font-semibold text-white tracking-tight">Export Complete!</p>
                  <p className="text-sm text-zinc-400">Your video is ready to download.</p>
                </div>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download
                    className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-medium transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    <Download className="size-4" /> Download {format.toUpperCase()}
                  </a>
                )}
                <button
                  onClick={triggerDownload}
                  className="w-full h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium text-zinc-300 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="size-4" /> Export again
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Pill({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="flex flex-col p-3.5 rounded-xl bg-white/[0.03] border border-white/10">
      <div className="flex items-center gap-1.5 text-zinc-400 mb-1.5">
        <Icon className="w-3.5 h-3.5 opacity-80" />
        <span className="text-[10px] uppercase tracking-widest font-semibold">{label}</span>
      </div>
      <p className="text-base font-mono font-medium text-zinc-100">{value}</p>
    </div>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">{label}</label>
      {children}
    </div>
  );
}
