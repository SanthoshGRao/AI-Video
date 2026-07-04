"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Cloud, CloudOff, Redo2, Undo2, Download, Check, ArrowRight, Pencil,
} from "lucide-react";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function TopNav({
  onBack,
  onNext,
}: {
  onBack?: () => void;
  onNext?: () => void;
}) {
  const router = useRouter();
  const {
    projectName, setProjectName, setExportOpen,
    dirty, autosave, toggleAutosave, save, lastSavedAt,
    undo, redo, canUndo, canRedo,
  } = useEditor();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(projectName), [projectName]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitName = () => {
    const next = draft.trim() || "Untitled Project";
    setProjectName(next);
    setEditing(false);
  };

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/dashboard");
  };

  return (
    <nav className="h-13 shrink-0 z-40 flex items-center justify-between px-4 py-2 bg-gradient-to-r from-[oklch(0.26_0.03_280)] via-[oklch(0.24_0.025_270)] to-[oklch(0.23_0.02_255)] border-b border-white/10 shadow-lg shadow-black/30">
      <div className="flex items-center gap-3">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition"
          title="Go back"
        >
          <ChevronLeft className="size-4" />
          <span className="text-xs font-medium">Back</span>
        </button>

        <div className="h-5 w-px bg-white/10" />

        {/* Project name (editable) */}
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") { setDraft(projectName); setEditing(false); }
            }}
            className="text-sm font-semibold bg-white/10 rounded-md px-2 py-1 outline-none ring-1 ring-brand/50 text-white max-w-[260px]"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="group flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/5 transition"
            title="Rename project"
          >
            <span className="text-sm font-semibold text-white truncate max-w-[260px]">{projectName}</span>
            <Pencil className="size-3 text-zinc-500 group-hover:text-zinc-300 transition" />
          </button>
        )}

        {/* Save status */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 border border-white/10">
          {dirty ? (
            <>
              <CloudOff className="size-3 text-amber-400" />
              <span className="text-[10px] font-medium text-amber-300 uppercase tracking-wider">Unsaved</span>
            </>
          ) : (
            <>
              <Cloud className="size-3 text-emerald-400" />
              <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                {lastSavedAt ? "Saved" : "Up to date"}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5 ml-1">
          <button
            onClick={() => { if (canUndo()) { undo(); toast.success("Undo"); } }}
            disabled={!canUndo()}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition disabled:opacity-30 disabled:pointer-events-none"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="size-3.5" />
          </button>
          <button
            onClick={() => { if (canRedo()) { redo(); toast.success("Redo"); } }}
            disabled={!canRedo()}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition disabled:opacity-30 disabled:pointer-events-none"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Autosave toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none px-2 py-1 rounded-md hover:bg-white/5 transition">
          <Switch checked={autosave} onCheckedChange={toggleAutosave} className="scale-90" />
          <span className="text-xs font-medium text-zinc-300">Autosave</span>
        </label>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => { save(false); toast.success("Project saved"); }}
          className="h-8 gap-1.5 text-xs text-zinc-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10"
        >
          <Check className="size-3.5" /> Save
        </Button>

        <Button
          size="sm"
          onClick={() => setExportOpen(true)}
          className="h-8 gap-1.5 bg-gradient-to-r from-brand to-brand-light hover:brightness-110 text-white shadow-[0_4px_20px_-4px_var(--brand)] border border-white/10 text-xs font-semibold"
        >
          <Download className="size-3.5" /> Export
        </Button>

        <Button
          size="sm"
          onClick={() => onNext ? onNext() : router.push("/final")}
          className="h-8 gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white border border-white/10 text-xs font-semibold"
        >
          Next <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </nav>
  );
}
