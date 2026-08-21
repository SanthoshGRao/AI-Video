"use client";

import { AlertTriangle, RotateCcw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatSnapshotSummary } from "@/lib/recovery/compare";
import type { SnapshotData } from "@/lib/recovery/types";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshotId: string;
  data: SnapshotData;
  reason: "crash" | "diff";
  onRestore: () => Promise<void>;
  onDismiss: () => void;
  busy?: boolean;
}

export function RecoveryDialog({
  open,
  onOpenChange,
  snapshotId,
  data,
  reason,
  onRestore,
  onDismiss,
  busy,
}: RecoveryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="w-5 h-5" />
            Recover your work?
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-600">
          {reason === "crash"
            ? "We detected an interrupted session. A recovery snapshot may contain work that was not fully saved."
            : "A recent autosave differs from the current project. You can restore that version."}
        </p>

        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm space-y-2">
          <p className="font-medium text-slate-900">
            Snapshot · {formatWhen(data.savedAt)}
          </p>
          <p className="text-xs text-slate-500">{formatSnapshotSummary(data)}</p>
          {data.studio.editedRawTextPreview && (
            <p className="text-xs text-slate-600 italic line-clamp-3 border-t border-amber-100 pt-2 mt-2">
              &ldquo;{data.studio.editedRawTextPreview}…&rdquo;
            </p>
          )}
          <p className="text-[10px] text-slate-400 font-mono">ID: {snapshotId.slice(0, 8)}…</p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
          <Button variant="secondary" onClick={onDismiss} disabled={busy}>
            <X className="w-4 h-4" />
            Keep current
          </Button>
          <Button onClick={onRestore} disabled={busy}>
            <RotateCcw className="w-4 h-4" />
            {busy ? "Restoring…" : "Restore snapshot"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
