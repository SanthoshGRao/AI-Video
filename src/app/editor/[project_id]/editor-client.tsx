"use client";

import { useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/editor-v2/top-nav";
import { IconRail } from "@/components/editor-v2/icon-rail";
import { AssetPanel } from "@/components/editor-v2/asset-panel";
import { CanvasStage } from "@/components/editor-v2/canvas-stage";
import { PropertiesPanel } from "@/components/editor-v2/properties-panel";
import { Timeline } from "@/components/editor-v2/timeline";
import { CommandPalette } from "@/components/editor-v2/command-palette";
import { ExportDialog } from "@/components/editor-v2/export-dialog";
import { KeyboardShortcuts } from "@/components/editor-v2/keyboard-shortcuts";
import { ShortcutsDialog } from "@/components/editor-v2/shortcuts-dialog";
import { SettingsDialog } from "@/components/editor-v2/settings-dialog";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { startIntegration, stopIntegration } from "@/lib/editor-v2/editor/integration-layer";
import { Toaster } from "sonner";

// The bootstrap type matches the state shape we need to hydrate.
// Assuming your backend sends { title, captions, voiceUrl, voiceDuration }
interface Props {
  projectId: string;
  bootstrap: any;
}

export default function EditorClient({ projectId, bootstrap }: Props) {
  const hydrateProject = useEditor((s) => s.hydrateProject);
  const loadProjectSession = useEditor((s) => s.loadProjectSession);
  const setExportOpen = useEditor((s) => s.setExportOpen);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hydratedProjectId = useRef<string | null>(null);

  useEffect(() => {
    startIntegration();
    return () => stopIntegration();
  }, []);

  useEffect(() => {
    if (!bootstrap || hydratedProjectId.current === projectId) return;

    async function init() {
      loadProjectSession(projectId, bootstrap.title ?? "Untitled Project");
      try {
        const mediaRes = await fetch(`/api/projects/${projectId}/media`, { cache: "no-store" });
        if (mediaRes.ok) {
          const json = await mediaRes.json();
          const rows = (json.media ?? []) as { id: string; r2Url: string; type: string; thumbnailUrl?: string | null; originalName?: string; mimeType?: string; fileSizeBytes?: number }[];
          useEditor.getState().reconcileProjectMedia(
            rows.map((m) => ({
              mediaAssetId: m.id,
              name: m.originalName ?? `Asset ${m.id.slice(0, 4)}`,
              kind: (m.mimeType?.startsWith("video/") || m.type === "VIDEO" ? "video" : m.mimeType?.startsWith("audio/") ? "audio" : "image") as "video" | "audio" | "image",
              src: m.r2Url,
              thumb: m.thumbnailUrl ?? m.r2Url,
              duration: (m as any).durationMs ? Math.round((m as any).durationMs / 1000) : 0,
              size: m.fileSizeBytes ?? 0,
            })),
          );
        } else if (bootstrap.projectMedia?.length) {
          useEditor.getState().reconcileProjectMedia(bootstrap.projectMedia);
        }
      } catch {
        if (bootstrap.projectMedia?.length) {
          useEditor.getState().reconcileProjectMedia(bootstrap.projectMedia);
        }
      }
      hydrateProject(bootstrap);
      hydratedProjectId.current = projectId;
    }

    void init();
  }, [bootstrap, hydrateProject, loadProjectSession, projectId]);

  return (
    <div className="editor-v2-container dark h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden selection:bg-brand/30">
      <KeyboardShortcuts />
      <TopNav onNext={() => setExportOpen(true)} />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <IconRail onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex-1 min-w-0 min-h-0 flex">
          <div className="w-[18%] min-w-[240px] max-w-[400px] border-r border-border bg-panel flex flex-col">
            <AssetPanel />
          </div>
          <main className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="flex-1 min-h-0 relative bg-canvas">
              <CanvasStage />
            </div>
            <div className="h-[38%] min-h-[200px] border-t border-border bg-panel">
              <Timeline />
            </div>
          </main>
          <div className="w-[20%] min-w-[260px] max-w-[400px] border-l border-border bg-panel flex flex-col">
            <PropertiesPanel />
          </div>
        </div>
      </div>
      <CommandPalette />
      <ExportDialog projectId={projectId} projectTitle={bootstrap?.title} />
      <ShortcutsDialog />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--ev2-panel-elevated)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            color: "var(--foreground)",
          },
        }}
      />
      <style dangerouslySetInnerHTML={{ __html: `
        .editor-v2-container,
        .editor-v2-container.dark {
          --background: 217 13% 5% !important;
          --foreground: 217 22% 95% !important;
          --canvas: 219 20% 2% !important;
          --panel: 217 10% 9% !important;
          --panel-elevated: 217 8% 13% !important;
          --card: 217 8% 11% !important;
          --card-foreground: 217 22% 95% !important;
          --popover: 217 8% 11% !important;
          --popover-foreground: 217 22% 95% !important;
          --primary: 252 125% 80% !important;
          --primary-foreground: 217 13% 5% !important;
          --brand: 259 97% 72% !important;
          --brand-light: 262 136% 84% !important;
          --secondary: 217 9% 16% !important;
          --secondary-foreground: 217 22% 95% !important;
          --muted: 217 8% 14% !important;
          --muted-foreground: 217 5% 63% !important;
          --accent: 217 9% 18% !important;
          --accent-foreground: 217 22% 95% !important;
          --destructive: 356 93% 63% !important;
          --destructive-foreground: 217 46% 98% !important;
          --border: 338 0% 100% !important;
          --input: 338 0% 100% !important;
          --ring: 258 84% 71% !important;

          --ev2-canvas: oklch(0.12 0.005 260) !important;
          --ev2-panel: oklch(0.20 0.006 260) !important;
          --ev2-panel-elevated: oklch(0.25 0.007 260) !important;
          --ev2-brand: oklch(0.66 0.20 295) !important;
          --ev2-brand-light: oklch(0.78 0.16 300) !important;
          --ev2-track-video: oklch(0.55 0.18 260) !important;
          --ev2-track-audio: oklch(0.62 0.16 160) !important;
          --ev2-track-text: oklch(0.65 0.18 50) !important;
        }
        .editor-v2-container * {
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
        .editor-v2-container .scroll-thin::-webkit-scrollbar { width: 8px; height: 8px; }
        .editor-v2-container .scroll-thin::-webkit-scrollbar-thumb { background: oklch(1 0 0 / 12%); border-radius: 4px; }
        .editor-v2-container .scroll-thin::-webkit-scrollbar-thumb:hover { background: oklch(1 0 0 / 22%); }
        .editor-v2-container .scroll-thin::-webkit-scrollbar-track { background: transparent; }
      ` }} />
    </div>
  );
}
