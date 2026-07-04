"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  ExternalLink,
  Archive,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";

interface ProjectActionsMenuProps {
  projectId: string;
  projectTitle: string;
  onDeleted?: () => void;
}

export function ProjectActionsMenu({
  projectId,
  projectTitle,
  onDeleted,
}: ProjectActionsMenuProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Duplicate failed");
      addToast({ type: "success", title: "Project duplicated" });
      invalidate();
      router.push(`/dashboard/projects/${data.project.id}/content`);
    } catch (e) {
      addToast({
        type: "error",
        title: "Could not duplicate",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      if (!res.ok) throw new Error("Archive failed");
      addToast({ type: "success", title: "Project archived" });
      invalidate();
      onDeleted?.();
    } catch {
      addToast({ type: "error", title: "Could not archive project" });
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      addToast({ type: "success", title: "Project deleted" });
      setConfirmDelete(false);
      invalidate();
      onDeleted?.();
    } catch {
      addToast({ type: "error", title: "Could not delete project" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors opacity-100"
            onClick={(e) => e.stopPropagation()}
            aria-label="Project options"
          >
            <MoreHorizontal className="w-4 h-4 text-slate-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            onSelect={() =>
              router.push(`/dashboard/projects/${projectId}/content`)
            }
          >
            <ExternalLink className="w-4 h-4" />
            Open studio
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              router.push(`/dashboard/projects/${projectId}/content`)
            }
          >
            <Sparkles className="w-4 h-4" />
            Generate content
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicate} disabled={busy}>
            <Copy className="w-4 h-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              router.push(`/dashboard/projects/new?duplicate=${projectId}`)
            }
          >
            <Pencil className="w-4 h-4" />
            Edit settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={archive} disabled={busy}>
            <Archive className="w-4 h-4" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmDelete(true)}
            disabled={busy}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden shadow-lg border-slate-200" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 pt-8 flex flex-col sm:flex-row gap-5 items-center sm:items-start text-center sm:text-left">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-red-100/50 shadow-sm">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div className="space-y-2 mt-1">
              <DialogHeader className="p-0 space-y-1 sm:text-left">
                <DialogTitle className="text-lg tracking-tight">Delete project?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-slate-500 leading-relaxed">
                You're about to delete <span className="font-semibold text-slate-900">"{projectTitle}"</span>. All scripts, media, and exports will be permanently removed. This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="bg-slate-50/80 px-6 py-4 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 border-t border-slate-100">
            <Button variant="outline" className="bg-white shadow-sm sm:w-auto w-full" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteProject}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700 shadow-sm sm:w-auto w-full"
            >
              {busy ? "Deleting..." : "Delete project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
