"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import {
  PERSONAL_WORKSPACE_ID,
  useActiveWorkspace,
} from "@/lib/workspace/workspace-store";
import { BUNDLE_EXTENSION } from "@/lib/transfer/bundle";

type ImportResult = {
  project: { id: string; title: string };
  imported: Record<string, number>;
  warnings: string[];
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/**
 * Import a `.aivproj` bundle into the active workspace.
 *
 * Uses XMLHttpRequest rather than fetch purely for upload progress — a
 * multi-gigabyte bundle needs a real progress bar, and fetch still has no
 * upload-progress event. The body is the raw file, which lets the server spool
 * it straight to disk instead of parsing multipart in memory.
 */
export function ImportProjectButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const { activeWs, activeWsId } = useActiveWorkspace();

  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setUploading(false);
    setPercent(0);
    setFileName("");
    setResult(null);
    setError(null);
  };

  const handleFile = (file: File) => {
    setOpen(true);
    setResult(null);
    setError(null);
    setUploading(true);
    setPercent(0);
    setFileName(`${file.name} · ${formatBytes(file.size)}`);

    const query =
      activeWsId && activeWsId !== PERSONAL_WORKSPACE_ID
        ? `?workspaceId=${encodeURIComponent(activeWsId)}`
        : "";

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/projects/import-bundle${query}`);
    xhr.setRequestHeader("Content-Type", "application/zip");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setPercent(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      let body: unknown = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* falls through to the generic message below */
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const data = body as ImportResult;
        setResult(data);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      } else {
        setError(
          (body as { error?: string }).error ??
            `Import failed (HTTP ${xhr.status})`
        );
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError("The upload failed before it reached the server.");
    };

    xhr.send(file);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={`${BUNDLE_EXTENSION},application/zip,.zip`}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // Clear it so picking the same file twice still fires onChange.
          e.target.value = "";
        }}
      />

      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        title="Import a project bundle (.aivproj)"
      >
        <Upload className="w-4 h-4" />
        Import project
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Closing mid-upload would only hide the progress; the request keeps
          // running either way, so block it until there's an outcome to show.
          if (uploading) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {result ? "Project imported" : error ? "Import failed" : "Importing project"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {result
                ? `Added to ${activeWs?.name ?? "Personal"}.`
                : fileName || "Reading bundle…"}
            </DialogDescription>
          </DialogHeader>

          {uploading && (
            <div className="space-y-3 py-2">
              <div className="h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                <div
                  className="h-full bg-[#2E8F63] transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {percent < 100
                  ? `Uploading ${percent}%`
                  : "Unpacking media and rebuilding the timeline…"}
              </p>
            </div>
          )}

          {error && (
            <div className="flex gap-3 py-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--text-secondary)]">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-3 py-1">
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#2E8F63] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {result.project.title}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {result.imported.mediaAssets} media ·{" "}
                    {result.imported.audioAssets} audio ·{" "}
                    {result.imported.timelines} timeline
                    {result.imported.timelines === 1 ? "" : "s"} ·{" "}
                    {result.imported.scriptVersions} script
                    {result.imported.scriptVersions === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              {result.warnings.length > 0 && (
                <ul className="text-xs text-amber-600 dark:text-amber-500 space-y-1 pl-8 list-disc">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!uploading && (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Close
              </Button>
              {result && (
                <Button
                  type="button"
                  onClick={() => {
                    const id = result.project.id;
                    setOpen(false);
                    reset();
                    addToast({ type: "success", title: "Opening project" });
                    router.push(`/dashboard/projects/${id}/content`);
                  }}
                >
                  Open project
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
