"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TopNav } from "@/components/editor-v2/top-nav";
import { IconRail } from "@/components/editor-v2/icon-rail";
import { AssetPanel } from "@/components/editor-v2/asset-panel";
import { CanvasStage } from "@/components/editor-v2/canvas-stage";
import { PropertiesPanel } from "@/components/editor-v2/properties-panel";
import { Timeline } from "@/components/editor-v2/timeline";
import { CommandPalette } from "@/components/editor-v2/command-palette";
import { ExportDialog } from "@/components/editor-v2/export-dialog";
import { ExportEditWarning } from "@/components/editor-v2/export-edit-warning";
import { KeyboardShortcuts } from "@/components/editor-v2/keyboard-shortcuts";
import { ShortcutsDialog } from "@/components/editor-v2/shortcuts-dialog";
import { SettingsDialog } from "@/components/editor-v2/settings-dialog";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { startIntegration, stopIntegration } from "@/lib/editor-v2/editor/integration-layer";
import { timelineDocumentToEditorState } from "@/lib/editor-v2/timeline-sync";
import { Toaster } from "sonner";

// The bootstrap type matches the state shape we need to hydrate.
// Assuming your backend sends { title, captions, voiceUrl, voiceDuration }
interface Props {
  projectId: string;
  bootstrap: any;
}

/* ------------------------------------------------------------------ */
/* Panel layout: sizes are a per-browser UI preference (not project    */
/* content), so they persist to localStorage rather than the server.   */
/* ------------------------------------------------------------------ */

const PANEL_LAYOUT_KEY = "editor-v2:panel-layout";

type PanelLayout = { assetWidth: number; propsWidth: number; timelineHeight: number };

const PANEL_DEFAULTS: PanelLayout = { assetWidth: 300, propsWidth: 320, timelineHeight: 280 };

const PANEL_LIMITS: Record<keyof PanelLayout, { min: number; max: number }> = {
  assetWidth: { min: 240, max: 400 },
  propsWidth: { min: 260, max: 400 },
  timelineHeight: { min: 200, max: 640 },
};

function clampPanel(key: keyof PanelLayout, value: number): number {
  const { min, max } = PANEL_LIMITS[key];
  return Math.min(max, Math.max(min, value));
}

function loadPanelLayout(): PanelLayout {
  if (typeof window === "undefined") return PANEL_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(PANEL_LAYOUT_KEY);
    if (!raw) return PANEL_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PanelLayout>;
    return {
      assetWidth: clampPanel("assetWidth", parsed.assetWidth ?? PANEL_DEFAULTS.assetWidth),
      propsWidth: clampPanel("propsWidth", parsed.propsWidth ?? PANEL_DEFAULTS.propsWidth),
      timelineHeight: clampPanel("timelineHeight", parsed.timelineHeight ?? PANEL_DEFAULTS.timelineHeight),
    };
  } catch {
    return PANEL_DEFAULTS;
  }
}

/** A single draggable divider that resizes one panel dimension. Persists to
 * localStorage on drag end (not every pointermove) so it doesn't spam writes
 * mid-drag. */
function useResizeHandle(
  layoutRef: React.MutableRefObject<PanelLayout>,
  setLayout: React.Dispatch<React.SetStateAction<PanelLayout>>,
  key: keyof PanelLayout,
  axis: "x" | "y",
  invert: boolean,
) {
  const dragRef = useRef<{ start: number; startValue: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { start: axis === "x" ? e.clientX : e.clientY, startValue: layoutRef.current[key] };

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pos = axis === "x" ? ev.clientX : ev.clientY;
      const delta = (pos - d.start) * (invert ? -1 : 1);
      setLayout((prev) => ({ ...prev, [key]: clampPanel(key, d.startValue + delta) }));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // layoutRef is kept in sync with state on every render, so by the time
      // this fires (after the last onMove's setState + re-render) it holds
      // the value actually dragged to.
      try {
        window.localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(layoutRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [axis, invert, key, layoutRef, setLayout]);

  return onPointerDown;
}

export default function EditorClient({ projectId, bootstrap }: Props) {
  const hydrateProject = useEditor((s) => s.hydrateProject);
  const loadProjectSession = useEditor((s) => s.loadProjectSession);
  const setExportOpen = useEditor((s) => s.setExportOpen);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hydratedProjectId = useRef<string | null>(null);
  const [layout, setLayout] = useState<PanelLayout>(loadPanelLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const assetHandle = useResizeHandle(layoutRef, setLayout, "assetWidth", "x", false);
  const timelineHandle = useResizeHandle(layoutRef, setLayout, "timelineHeight", "y", true);
  const propsHandle = useResizeHandle(layoutRef, setLayout, "propsWidth", "x", true);

  useEffect(() => {
    startIntegration();
    return () => stopIntegration();
  }, []);

  useEffect(() => {
    if (!bootstrap || hydratedProjectId.current === projectId) return;

    async function init() {
      // The server's saved Timeline row is authoritative when one exists —
      // convert it back into editor-v2's shape so a reload reflects what
      // was actually persisted, instead of only ever reading this browser's
      // localStorage backup (which could be stale, cleared, or missing
      // entirely on a different device).
      const serverSeed = bootstrap.timeline ? timelineDocumentToEditorState(bootstrap.timeline) : null;
      loadProjectSession(projectId, bootstrap.title ?? "Untitled Project", serverSeed);
      try {
        const mediaRes = await fetch(`/api/projects/${projectId}/media`, { cache: "no-store" });
        if (mediaRes.ok) {
          const json = await mediaRes.json();
          const rows = (json.media ?? []) as { id: string; r2Url: string; type: string; thumbnailUrl?: string | null; originalName?: string; mimeType?: string; fileSizeBytes?: number }[];
          useEditor.getState().reconcileProjectMedia(
            rows.map((m) => {
              const kind = (m.mimeType?.startsWith("video/") || m.type === "VIDEO" ? "video" : m.mimeType?.startsWith("audio/") ? "audio" : "image") as "video" | "audio" | "image";
              return {
                mediaAssetId: m.id,
                name: m.originalName ?? `Asset ${m.id.slice(0, 4)}`,
                kind,
                src: m.r2Url,
                thumb: m.thumbnailUrl ?? (kind === "image" ? m.r2Url : undefined),
                duration: (m as any).durationMs ? Math.round((m as any).durationMs / 1000) : 0,
                size: m.fileSizeBytes ?? 0,
              };
            }),
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
          <div className="shrink-0 border-r border-border bg-panel flex flex-col" style={{ width: layout.assetWidth }}>
            <AssetPanel />
          </div>
          <div
            onPointerDown={assetHandle}
            className="w-1 shrink-0 cursor-col-resize hover:bg-brand/40 active:bg-brand/60 transition-colors"
            title="Drag to resize"
          />
          <main className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="flex-1 min-h-0 relative bg-canvas">
              <CanvasStage />
            </div>
            <div
              onPointerDown={timelineHandle}
              className="h-1 shrink-0 cursor-row-resize hover:bg-brand/40 active:bg-brand/60 transition-colors"
              title="Drag to resize"
            />
            <div className="shrink-0 border-t border-border bg-panel" style={{ height: layout.timelineHeight }}>
              <Timeline />
            </div>
          </main>
          <div
            onPointerDown={propsHandle}
            className="w-1 shrink-0 cursor-col-resize hover:bg-brand/40 active:bg-brand/60 transition-colors"
            title="Drag to resize"
          />
          <div className="shrink-0 border-l border-border bg-panel flex flex-col" style={{ width: layout.propsWidth }}>
            <PropertiesPanel />
          </div>
        </div>
      </div>
      <CommandPalette />
      <ExportDialog projectId={projectId} projectTitle={bootstrap?.title} />
      <ExportEditWarning />
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
          --primary: 152 60% 70% !important;
          --primary-foreground: 217 13% 5% !important;
          --brand: 153 55% 55% !important;
          --brand-light: 153 45% 68% !important;
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
          --ring: 153 55% 55% !important;

          --ev2-canvas: oklch(0.12 0.005 260) !important;
          --ev2-panel: oklch(0.20 0.006 260) !important;
          --ev2-panel-elevated: oklch(0.25 0.007 260) !important;
          --ev2-brand: oklch(0.66 0.16 155) !important;
          --ev2-brand-light: oklch(0.78 0.14 155) !important;
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
