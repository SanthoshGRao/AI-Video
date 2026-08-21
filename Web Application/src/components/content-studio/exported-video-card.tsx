"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Film, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ExportJobRow {
  id: string;
  status: string;
  format: string;
  aspectRatio: string;
  renderProgress: number;
  downloadUrl: string | null;
  errorMessage: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
  completedAt: string | null;
}

/** Statuses where the render is still going, so the panel keeps polling. */
const IN_FLIGHT = new Set(["QUEUED", "PROCESSING", "RENDERING", "POST_PROCESSING", "UPLOADING"]);

const POLL_MS = 3000;

function formatSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

/** "9:16" → a CSS aspect-ratio value, falling back to portrait. */
function cssAspect(ratio: string | undefined): string {
  const m = /^(\d+)\s*[:/x]\s*(\d+)$/.exec(ratio ?? "");
  return m ? `${m[1]} / ${m[2]}` : "9 / 16";
}

/**
 * The exported video, in the final-post panel.
 *
 * The editor writes every render to an ExportJob row, so the finished MP4 is
 * addressable long after the export dialog is closed — this fetches the most
 * recent one for the project and plays it inline instead of sending the user
 * back to the editor to re-export.
 */
export function ExportedVideoCard({
  projectId,
  onGoToEditor,
}: {
  projectId: string;
  onGoToEditor?: () => void;
}) {
  const [job, setJob] = useState<ExportJobRow | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { jobs?: ExportJobRow[] };
      const jobs = data.jobs ?? [];
      // A render in flight is what the user is waiting on; otherwise show the
      // newest export that actually produced a file. A failed run only wins
      // when there's nothing playable at all.
      const next =
        jobs.find((j) => IN_FLIGHT.has(j.status)) ??
        jobs.find((j) => j.status === "DONE" && j.downloadUrl) ??
        jobs[0] ??
        null;
      setJob(next);
    } catch {
      // Offline / transient — keep whatever is on screen.
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    // Exports are usually kicked off from the Editor tab, so re-check whenever
    // the window regains focus (e.g. after switching back to this tab).
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const rendering = job != null && IN_FLIGHT.has(job.status);

  useEffect(() => {
    if (!rendering) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => void load(), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [rendering, load]);

  const ready = job?.status === "DONE" && job.downloadUrl;
  const size = formatSize(job?.fileSizeBytes ?? null);

  return (
    <Card className="shadow-sm border-indigo-100">
      <CardContent className="p-5 space-y-3 bg-indigo-50/30 h-full flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-indigo-900">Edited Video</h3>
          {ready && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => void load()}
                title="Check for a newer export"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" asChild>
                <a
                  href={job!.downloadUrl!}
                  download={`video.${job!.format || "mp4"}`}
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              </Button>
            </div>
          )}
        </div>

        {ready ? (
          <>
            <div className="flex-1 flex items-center justify-center">
              <video
                key={job!.id}
                src={job!.downloadUrl!}
                controls
                playsInline
                preload="metadata"
                className="rounded-xl bg-black max-h-[420px] w-auto max-w-full shadow-sm"
                style={{ aspectRatio: cssAspect(job!.aspectRatio) }}
              />
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              {(job!.format || "mp4").toUpperCase()}
              {size ? ` · ${size}` : ""}
              {job!.completedAt
                ? ` · rendered ${new Date(job!.completedAt).toLocaleString()}`
                : ""}
            </p>
          </>
        ) : rendering ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-3 py-8">
            <Film className="w-6 h-6 text-indigo-400 animate-pulse" />
            <p className="text-xs text-slate-600">
              Rendering your video… {Math.max(1, job?.renderProgress ?? 0)}%
            </p>
            <div className="w-full max-w-[220px] h-1.5 rounded-full bg-indigo-100 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.max(2, Math.min(100, job?.renderProgress ?? 0))}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-3 py-8">
            <p className="text-xs text-slate-600 max-w-[260px]">
              {loading
                ? "Checking for a rendered video…"
                : job?.status === "FAILED"
                  ? `Last export failed${job.errorMessage ? `: ${job.errorMessage}` : ""}. Export again from the Editor.`
                  : "No export yet. Render the final MP4 from the Editor and it will appear here."}
            </p>
            {onGoToEditor && !loading && (
              <Button size="sm" variant="outline" className="bg-white" onClick={onGoToEditor}>
                Go to Editor
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
