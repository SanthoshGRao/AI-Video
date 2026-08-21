import { useEffect, useState } from "react";
import { useProject } from "@/hooks/use-projects";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import type { AudioAsset } from "@/types";
import { toast } from "sonner";
import { TopNav } from "@/components/editor-v2/top-nav";
import { IconRail } from "@/components/editor-v2/icon-rail";
import { AssetPanel } from "@/components/editor-v2/asset-panel";
import { CanvasStage } from "@/components/editor-v2/canvas-stage";
import { PropertiesPanel } from "@/components/editor-v2/properties-panel";
import { Timeline } from "@/components/editor-v2/timeline";
import { ExportDialog } from "@/components/editor-v2/export-dialog";
import { CommandPalette } from "@/components/editor-v2/command-palette";
import { ShortcutsDialog } from "@/components/editor-v2/shortcuts-dialog";
import { KeyboardShortcuts } from "@/components/editor-v2/keyboard-shortcuts";
import { SettingsDialog } from "@/components/editor-v2/settings-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { startIntegration, stopIntegration, resyncMedia } from "@/lib/editor-v2/editor/integration-layer";
import { syncLegacyBridgeNow } from "@/lib/editor-v2/editor/legacy-bridge";
import { timelineDocumentToEditorState } from "@/lib/editor-v2/timeline-sync";
import { parseTimelineRow } from "@/lib/timeline/parse";

function probeAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => resolve(0);
    el.src = url;
  });
}

export function VideoEditorPanel({
  projectId,
  projectTitle = "Video project",
  audio,
  mediaCount,
  mediaAssets = [],
  extractedFacts,
  onBackToSubtitles,
  onNext,
}: {
  projectId: string;
  projectTitle?: string;
  audio: AudioAsset | null;
  mediaCount?: number;
  mediaAssets?: { id: string; r2Url: string; type: string; thumbnailUrl: string | null }[];
  extractedFacts?: unknown;
  onBackToSubtitles?: () => void;
  onNext?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    startIntegration();
    return () => {
      stopIntegration();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function loadData() {
      try {
        const state = useEditor.getState();
        void state.loadUserLibrary();

        // Load through the SAME bootstrap as the standalone /editor page —
        // saved timeline as the authoritative seed, plus project media that
        // includes global-library assets referenced by the timeline's clips.
        // This panel previously rebuilt all of that itself from
        // project-scoped endpoints (and seeded from localStorage first), so a
        // library asset placed on the timeline was missing from the media
        // allowlist and the cross-project guard stripped its clip on every
        // mount of this tab — then autosaved the stripped timeline.
        const res = await fetch(`/api/projects/${projectId}/editor-bootstrap`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Editor bootstrap failed: ${res.status}`);
        const bootstrap = await res.json();
        if (cancelled) return;

        const serverSeed = bootstrap.timeline
          ? timelineDocumentToEditorState(parseTimelineRow(bootstrap.timeline))
          : null;
        state.loadProjectSession(projectId, projectTitle || bootstrap.title || "Untitled Project", serverSeed);

        // Same media refresh as editor-client: authoritative asset list from
        // the project media API (repairs expired blob/thumb URLs), falling
        // back to the bootstrap's list if the request fails.
        try {
          const mediaRes = await fetch(`/api/projects/${projectId}/media`, { cache: "no-store" });
          if (mediaRes.ok) {
            const mediaJson = await mediaRes.json();
            const rows = (mediaJson.media ?? []) as {
              id: string;
              r2Url: string;
              type: string;
              thumbnailUrl?: string | null;
              originalName?: string;
              fileSizeBytes?: number;
              mimeType?: string;
              durationMs?: number;
            }[];
            state.reconcileProjectMedia(
              rows.map((m) => {
                const kind = (m.mimeType?.startsWith("video/") || m.type === "VIDEO"
                  ? "video"
                  : m.mimeType?.startsWith("audio/")
                    ? "audio"
                    : "image") as "video" | "audio" | "image";
                return {
                  mediaAssetId: m.id,
                  name: m.originalName ?? `Asset ${m.id.slice(0, 4)}`,
                  kind,
                  src: m.r2Url,
                  thumb: m.thumbnailUrl ?? (kind === "image" ? m.r2Url : undefined),
                  duration: Math.round((Number(m.durationMs) || 0) / 1000),
                  size: m.fileSizeBytes ?? 0,
                };
              }),
            );
          } else if (bootstrap.projectMedia?.length) {
            state.reconcileProjectMedia(bootstrap.projectMedia);
          }
        } catch {
          if (bootstrap.projectMedia?.length) {
            state.reconcileProjectMedia(bootstrap.projectMedia);
          }
        }
        if (cancelled) return;

        // Panel nicety kept from the old loader: make sure the seeded
        // voiceover width covers the real audio duration.
        let voiceDurationSec = typeof bootstrap.voiceDuration === "number"
          ? bootstrap.voiceDuration
          : audio ? audio.durationMs / 1000 : 0;
        if (audio?.r2Url) {
          const probed = await probeAudioDuration(audio.r2Url);
          voiceDurationSec = Math.max(voiceDurationSec, probed);
        }
        const captions = (bootstrap.captions ?? []) as { end?: number }[];
        const captionEndSec = captions.reduce((max, c) => Math.max(max, c.end ?? 0), 0);
        voiceDurationSec = Math.max(voiceDurationSec, captionEndSec, 12);

        if (cancelled) return;
        state.hydrateProject({ ...bootstrap, voiceDuration: voiceDurationSec });

        syncLegacyBridgeNow();
        resyncMedia();
        state.setPlayhead(0);
        setLoading(false);
      } catch (e) {
        console.error("Failed to hydrate editor", e);
        if (!cancelled) {
          toast.error("Couldn't load the editor. Try refreshing the page.");
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
    // audio?.id (not the object) — parent re-renders recreate the prop objects,
    // and re-running this loader mid-session resets live editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, audio?.id]);

  if (loading) {
    return (
      <div className="editor-v2-container dark fixed inset-0 z-50 flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" label="Initializing editor workspace..." />
      </div>
    );
  }

  return (
    <div className="editor-v2-container dark fixed inset-0 z-50 flex flex-col bg-background text-foreground overflow-hidden selection:bg-brand/30">
      <KeyboardShortcuts />
      <TopNav onBack={onBackToSubtitles} onNext={onNext} />
      <main className="flex-1 flex overflow-hidden min-h-0">
        <IconRail onOpenSettings={() => setSettingsOpen(true)} />
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={20} minSize={14} maxSize={36}>
            <AssetPanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={58} minSize={30}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={62} minSize={25}>
                <CanvasStage />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={38} minSize={15} maxSize={70}>
                <Timeline />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={22} minSize={14} maxSize={36}>
            <PropertiesPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      <ExportDialog projectId={projectId} projectTitle={projectTitle} />
      <CommandPalette />
      <ShortcutsDialog />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      {/* Toaster is mounted once in the dashboard layout — this panel renders
          inside it, so a local one would show every toast twice. */}

      <style dangerouslySetInnerHTML={{ __html: `
        .editor-v2-container,
        .editor-v2-container.dark {
          --background: 240 6% 10% !important;
          --foreground: 240 5% 96% !important;
          --canvas: oklch(0.12 0.005 260) !important;
          --panel: oklch(0.20 0.006 260) !important;
          --panel-elevated: oklch(0.25 0.007 260) !important;
          --card: 240 6% 14% !important;
          --card-foreground: 240 5% 96% !important;
          --popover: 240 6% 14% !important;
          --popover-foreground: 240 5% 96% !important;
          --primary: 290 65% 65% !important;
          --primary-foreground: 240 6% 10% !important;
          --brand: 295 75% 60% !important;
          --brand-light: 300 70% 70% !important;
          --secondary: 240 5% 22% !important;
          --secondary-foreground: 240 5% 96% !important;
          --muted: 240 5% 20% !important;
          --muted-foreground: 240 4% 65% !important;
          --accent: 240 5% 24% !important;
          --accent-foreground: 240 5% 96% !important;
          --destructive: 0 75% 55% !important;
          --destructive-foreground: 240 5% 96% !important;
          --border: 0 0% 100% !important;
          --input: 0 0% 100% !important;
          --ring: 295 75% 60% !important;

          --ev2-canvas: oklch(0.12 0.005 260) !important;
          --ev2-panel: oklch(0.20 0.006 260) !important;
          --ev2-panel-elevated: oklch(0.25 0.007 260) !important;
          --ev2-brand: oklch(0.66 0.20 295) !important;
          --ev2-brand-light: oklch(0.78 0.16 300) !important;
          --ev2-track-video: oklch(0.55 0.18 260) !important;
          --ev2-track-audio: oklch(0.62 0.16 160) !important;
          --ev2-track-text: oklch(0.65 0.18 50) !important;

          color-scheme: dark;
          background-color: hsl(var(--background));
          color: hsl(var(--foreground));
        }
        .editor-v2-container * {
          border-color: hsl(var(--border) / 0.1) !important;
        }
        .editor-v2-container .scroll-thin::-webkit-scrollbar { width: 8px; height: 8px; }
        .editor-v2-container .scroll-thin::-webkit-scrollbar-thumb { background: oklch(1 0 0 / 12%); border-radius: 4px; }
        .editor-v2-container .scroll-thin::-webkit-scrollbar-thumb:hover { background: oklch(1 0 0 / 22%); }
        .editor-v2-container .scroll-thin::-webkit-scrollbar-track { background: transparent; }
      ` }} />
    </div>
  );
}
