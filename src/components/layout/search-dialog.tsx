"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FolderOpen, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/hooks/use-projects";
import { cn } from "@/lib/utils";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { data: projects = [] } = useProjects();

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects.slice(0, 8);
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.template?.name.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q)
    );
  }, [projects, query]);

  const go = (path: string) => {
    onOpenChange(false);
    router.push(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              className="pl-9 h-11 border-slate-200"
              autoFocus
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-500">
              ESC
            </kbd>
          </div>
        </DialogHeader>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No projects found</p>
          ) : (
            <ul className="space-y-1">
              {results.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() =>
                      go(`/dashboard/projects/${project.id}/content`)
                    }
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <FolderOpen className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {project.title}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">
                        {project.template?.name ?? "Project"} ·{" "}
                        {project.status.toLowerCase().replace(/_/g, " ")}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-2 flex items-center justify-between text-[10px] text-slate-400">
          <span>⌘K to open search</span>
          <button
            type="button"
            className="text-indigo-600 hover:underline font-medium"
            onClick={() => go("/dashboard/projects/new")}
          >
            + New project
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
