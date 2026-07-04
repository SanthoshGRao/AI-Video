/**
 * Editor root. Composes all panels and starts the playback clock.
 * Exported component receives a `projectId`; calls `loadProjectBundle`
 * via the active adapter and `buildTimelineFromProjectBundle` happens
 * automatically inside the store.
 */
import { useEffect } from "react";
import { useEditorStore } from "../store";
import { usePlaybackClock } from "../playback";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { LeftPanel } from "./LeftPanel";
import { PreviewCanvas } from "./PreviewCanvas";
import { TransportBar } from "./TransportBar";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";
import { AudioPlayer } from "./AudioPlayer";

export function Editor({ projectId, onBack, onNext }: { projectId: string, onBack?: () => void, onNext?: () => void }) {
  const loading = useEditorStore((s) => s.loading);
  const error = useEditorStore((s) => s.error);
  const timeline = useEditorStore((s) => s.timeline);
  const loadProject = useEditorStore((s) => s.loadProject);

  useEffect(() => {
    void loadProject(projectId);
  }, [projectId, loadProject]);

  usePlaybackClock();

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-red-600">
        Failed to load project: {error}
      </div>
    );
  }
  if (loading || !timeline) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-50 text-slate-900">
      <TopBar onBack={onBack} onNext={onNext} />
      <div className="flex flex-1 overflow-hidden">
        <LeftRail />
        <LeftPanel />
        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewCanvas />
          <TransportBar />
          <div className="h-[44%] min-h-[260px]">
            <Timeline />
          </div>
        </div>
        <Inspector />
      </div>
      <AudioPlayer />
    </div>
  );
}
