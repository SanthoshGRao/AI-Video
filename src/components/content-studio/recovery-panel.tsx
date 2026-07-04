"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, RotateCcw, ChevronDown, ChevronUp, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
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

type SnapshotRow = {
  id: string;
  source: string;
  createdAt: string;
  data: SnapshotData | null;
};

interface RecoveryPanelProps {
  projectId: string;
  onRestore: (snapshotId: string) => Promise<void>;
  onManualSave: () => Promise<void>;
  toast: (type: "success" | "error", title: string) => void;
}

export function RecoveryPanel({
  projectId,
  onRestore,
  onManualSave,
  toast,
}: RecoveryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["recovery-snapshots", projectId],
    queryFn: () =>
      fetch(`/api/projects/${projectId}/snapshot`).then((r) => {
        if (!r.ok) throw new Error("Failed to load snapshots");
        return r.json() as Promise<{ latest: SnapshotRow | null; snapshots: SnapshotRow[] }>;
      }),
  });

  const snapshots = (data?.snapshots ?? []).filter((s) => s.data);

  const handleRestore = async (id: string) => {
    setBusyId(id);
    try {
      await onRestore(id);
      await refetch();
      toast("success", "Project restored from snapshot");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleManual = async () => {
    setBusyId("manual");
    try {
      await onManualSave();
      await refetch();
      toast("success", "Recovery point saved");
    } catch {
      toast("error", "Could not save recovery point");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="shadow-sm border-slate-200">
      <CardContent className="p-0">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold">Recovery</span>
            <Badge variant="secondary" className="text-[10px]">
              {snapshots.length} saved
            </Badge>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {expanded && (
          <div className="border-t border-slate-100 px-5 py-4 space-y-3">
            <p className="text-xs text-slate-500">
              Autosave every 30s. Snapshots kept for 7 days (max 20).
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={!!busyId}
              onClick={handleManual}
            >
              {busyId === "manual" ? (
                <LoadingSpinner />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save recovery point now
            </Button>

            {isLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner />
              </div>
            ) : snapshots.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                No snapshots yet
              </p>
            ) : (
              <ul className="space-y-2 max-h-[240px] overflow-y-auto">
                {snapshots.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800">
                        {formatWhen(s.createdAt)}
                        {i === 0 && (
                          <Badge variant="default" className="ml-2 text-[9px]">
                            Latest
                          </Badge>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-500 capitalize">
                        {s.source} · {s.data ? formatSnapshotSummary(s.data) : "—"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-8"
                      disabled={!!busyId}
                      onClick={() => handleRestore(s.id)}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
