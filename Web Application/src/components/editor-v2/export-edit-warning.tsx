"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { cancelExportJob } from "@/lib/editor-v2/export-control";
import { toast } from "sonner";
import { useState } from "react";

/**
 * Warns when the timeline is edited while an export is rendering.
 *
 * The render works from the snapshot taken when Export was clicked, so edits
 * made now won't be in the file — the user either accepts that (the export
 * finishes as-is) or stops the export and keeps editing. Raised by
 * markDirty() in editor-store.ts; shown once per export run.
 */
export function ExportEditWarning() {
  const { exportEditWarning, setExportEditWarning, exportJobId, activeProjectId, setExportRun } = useEditor();
  const [stopping, setStopping] = useState(false);

  const stopAndEdit = async () => {
    if (!activeProjectId || !exportJobId) {
      setExportRun("IDLE", null);
      setExportEditWarning(false);
      return;
    }
    setStopping(true);
    try {
      await cancelExportJob(activeProjectId, exportJobId);
      // The dialog's poll loop sees the terminal job and stops; clearing the
      // job id here also stops it if the dialog is closed.
      setExportRun("IDLE", null);
      setExportEditWarning(false);
      toast.info("Export stopped — keep editing.", { id: "export" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop the export.", { id: "export" });
    } finally {
      setStopping(false);
    }
  };

  return (
    <AlertDialog open={exportEditWarning} onOpenChange={(open) => !open && setExportEditWarning(false)}>
      <AlertDialogContent className="bg-zinc-950/90 backdrop-blur-2xl border border-white/10 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle>Export in progress</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            This video is still rendering. It uses the timeline as it was when you
            started the export, so changes you make now won&apos;t appear in the file
            being written.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <button
            onClick={() => setExportEditWarning(false)}
            disabled={stopping}
            className="h-10 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium text-zinc-300 transition-all disabled:opacity-50"
          >
            Keep exporting
          </button>
          <button
            onClick={stopAndEdit}
            disabled={stopping}
            className="h-10 px-4 rounded-lg bg-red-500/90 hover:bg-red-500 text-sm font-medium text-white transition-all disabled:opacity-50"
          >
            {stopping ? "Stopping…" : "Stop export & edit"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
