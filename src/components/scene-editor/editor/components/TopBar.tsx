import { useEffect, useState } from "react";
import { editorHistory, useEditorStore } from "../store";
import { fmtTime } from "../utils";
import { Download, Redo2, Save, Undo2, ArrowLeft, ArrowRight } from "lucide-react";
import { getEditorAdapter } from "../adapter";

export function TopBar({ onBack, onNext }: { onBack?: () => void, onNext?: () => void }) {
  const projectId = useEditorStore((s) => s.projectId);
  const bundle = useEditorStore((s) => s.bundle);
  const timeline = useEditorStore((s) => s.timeline);
  const currentTime = useEditorStore((s) => s.currentTime);

  const [, force] = useState(0);
  useEffect(() => editorHistory.subscribe(() => force((n) => n + 1)), []);

  const onSave = async () => {
    if (!projectId || !timeline) return;
    await getEditorAdapter().saveTimeline(projectId, timeline);
  };

  const onExport = () => {
    if (!timeline) return;
    const json = JSON.stringify(timeline, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bundle?.project.name ?? "timeline"}.timeline.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 mr-2"
            title="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600" />
        <input
          className="rounded-md bg-transparent px-2 py-1 text-sm font-medium text-slate-900 outline-none hover:bg-slate-50 focus:bg-slate-50"
          defaultValue={bundle?.project.name ?? "Untitled Project"}
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{fmtTime(currentTime)}</span>
        <span className="text-slate-300">/</span>
        <span>{fmtTime(timeline?.duration ?? 0)}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={editorHistory.undo}
          disabled={!editorHistory.canUndo()}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          title="Undo (⌘Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={editorHistory.redo}
          disabled={!editorHistory.canRedo()}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          title="Redo (⌘⇧Z)"
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <button
          onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          <Save className="h-4 w-4" /> Save
        </button>
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          <Download className="h-4 w-4" /> Export JSON
        </button>
        {onNext && (
          <button
            onClick={onNext}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 ml-2"
          >
            Finalize <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}
