import { useEffect, useState } from "react";
import { useProject } from "@/hooks/use-projects";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import type { AudioAsset } from "@/types";
import { Toaster } from "sonner";
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
import { cuesToEditorCaptions, parseCuesJson } from "@/lib/subtitles/cues";
import { timelineDocumentToEditorState } from "@/lib/editor-v2/timeline-sync";
import { parseTimelineRow } from "@/lib/timeline/parse";
import { resolveSubtitleStyle, stripFactCategoryPrefix, TITLE_FACT_CATEGORY_LABELS } from "@/lib/subtitles/presets";
import type { SubtitleStyle } from "@/lib/subtitles/types";

function probeAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => resolve(0);
    el.src = url;
  });
}

function titleTextFromValue(key: string, value: unknown): string[] {
  const label = TITLE_FACT_CATEGORY_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").trim();
  if (value == null || value === "") return [];
  if (typeof value === "boolean") return value ? [label] : [];
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s ? [stripFactCategoryPrefix(s)] : [];
  }
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (item == null || item === "") return [];
    if (typeof item === "string" || typeof item === "number") {
      const s = String(item).trim();
      return s ? [stripFactCategoryPrefix(s)] : [];
    }
    if (typeof item === "object") {
      const values = Object.values(item as Record<string, unknown>)
        .filter((v) => v != null && v !== "")
        .join(" ");
      return values ? [stripFactCategoryPrefix(values)] : [];
    }
    return [];
  });
}

function buildTitleRowsFromFacts(facts: unknown, durationMs?: number): any[] {
  const existingRows = Array.isArray(facts)
    ? facts.filter((fact): fact is any => typeof fact?.text === "string")
    : [];
  
  const texts: any[] = existingRows.length > 0
    ? existingRows.map((fact) => ({
      id: typeof fact.id === "string" ? fact.id : undefined,
      text: fact.text,
      category: fact.category,
      startMs: typeof fact.startMs === "number" ? fact.startMs : undefined,
      endMs: typeof fact.endMs === "number" ? fact.endMs : undefined,
    }))
    : facts && typeof facts === "object"
      ? Object.entries(facts as Record<string, unknown>).flatMap(([key, value]) =>
        titleTextFromValue(key, value).map((text, index) => ({
          id: `${key}-${index}`,
          text,
          category: TITLE_FACT_CATEGORY_LABELS[key] ?? key,
        }))
      )
      : [];

  const visibleTexts = texts.filter((row) => row.text.trim()).slice(0, 8);
  const totalMs = Math.max(durationMs ?? 0, visibleTexts.length * 3000, 3000);
  const slotMs = Math.max(2500, Math.floor(totalMs / Math.max(visibleTexts.length, 1)));

  return visibleTexts.map((row, index) => {
    const startMs = row.startMs ?? index * slotMs;
    const endMs = row.endMs ?? Math.min(totalMs, startMs + slotMs);
    return {
      id: row.id ?? `title-${index}`,
      text: row.text.trim(),
      category: row.category,
      startMs,
      endMs: Math.max(startMs + 250, endMs),
    };
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
        // 1. Load project-scoped session (prevents media/clips leaking across projects)
        const state = useEditor.getState();
        state.loadProjectSession(projectId, projectTitle);
        void state.loadUserLibrary();

        // 2. Fetch all project media (parent prop may be capped at 12 items)
        let projectMediaItems: {
          mediaAssetId: string;
          name: string;
          kind: "video" | "audio" | "image";
          src: string;
          thumb: string;
          duration: number;
          size: number;
        }[] = [];
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
            projectMediaItems = rows.map((m) => ({
              mediaAssetId: m.id,
              name: m.originalName ?? `Asset ${m.id.slice(0, 4)}`,
              kind: (m.mimeType?.startsWith("video/") || m.type === "VIDEO"
                ? "video"
                : m.mimeType?.startsWith("audio/")
                  ? "audio"
                  : "image") as "video" | "audio" | "image",
              src: m.r2Url,
              thumb: m.thumbnailUrl ?? m.r2Url,
              duration: Math.round((Number(m.durationMs) || 0) / 1000),
              size: m.fileSizeBytes ?? 0,
            }));
          }
        } catch (e) {
          console.warn("Failed to fetch project media", e);
        }
        if (projectMediaItems.length === 0 && mediaAssets.length > 0) {
          projectMediaItems = mediaAssets.map((m) => ({
            mediaAssetId: m.id,
            name: `Asset ${m.id.slice(0, 4)}`,
            kind: (m.type.startsWith("video")
              ? "video"
              : m.type.startsWith("audio")
                ? "audio"
                : "image") as "video" | "audio" | "image",
            src: m.r2Url,
            thumb: m.thumbnailUrl ?? m.r2Url,
            duration: 0,
            size: 0,
          }));
        }

        // 3. Fetch timeline — restore full edit (clips, layout, transitions) from server
        let titleCards: any[] = [];
        let fetchedAspect: any = null;
        let restoredFromServer = false;
        let hasTimelineTitles = false;
        let hasTimelineSubtitles = false;

        try {
          const tlRes = await fetch(`/api/projects/${projectId}/timeline`, { cache: "no-store" });
          if (tlRes.ok) {
            const tlJson = await tlRes.json();
            const timeline = tlJson.timeline;
            if (timeline?.settings?.aspectRatio) {
              fetchedAspect = timeline.settings.aspectRatio;
            }
            if (timeline?.clips && Object.keys(timeline.clips).length > 0) {
              const doc = parseTimelineRow(timeline);
              const restored = timelineDocumentToEditorState(doc);
              
              hasTimelineTitles = restored.clips.some((c) => c.kind === "text");
              hasTimelineSubtitles = restored.clips.some((c) => c.kind === "subtitle");

              useEditor.setState({
                activeProjectId: projectId,
                clips: restored.clips,
                elements: restored.elements,
                tracks: restored.tracks,
                transitions: restored.transitions,
                background: restored.background,
                aspect: restored.aspect,
                settings: { ...useEditor.getState().settings, fps: restored.fps },
                dirty: false,
              });
              restoredFromServer = true;

              const clips = Object.values(timeline.clips) as any[];
              
              // 1. Try to find user custom titles (category === "title")
              let tClips = clips.filter((c: any) => {
                if (c?.type !== "text" && c?.kind !== "text" && c?.kind !== "subtitle") return false;
                const meta = c?.properties?.textOverlayMeta;
                const isSubtitle = c?.trackId === "track-subtitle" || meta?.category === "subtitle";
                if (isSubtitle) return false;
                return meta?.category === "title";
              });
              
              // 2. If no custom titles, fallback to auto-generated fact/title clips
              if (tClips.length === 0) {
                tClips = clips.filter((c: any) => {
                  if (c?.type !== "text" && c?.kind !== "text" && c?.kind !== "subtitle") return false;
                  const meta = c?.properties?.textOverlayMeta;
                  const isSubtitle = c?.trackId === "track-subtitle" || meta?.category === "subtitle";
                  if (isSubtitle) return false;
                  return meta?.isAutoGenerated === true || c?.trackId === "track-facts" || c?.trackId === "track-text";
                });
              }

              if (tClips.length > 0) {
                titleCards = tClips.map((c) => {
                  const metaStyle = c.properties?.textOverlayMeta?.titleStyle;
                  const propStyle = c.properties?.style;
                  const bgOpacity = propStyle?.backgroundColor?.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)
                    ? Math.round(parseFloat(propStyle.backgroundColor.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)[1]) * 100)
                    : 0;

                  const titleStyle = metaStyle || (propStyle ? {
                    fontFamily: propStyle.fontFamily,
                    fontSize: propStyle.fontSize,
                    fontWeight: propStyle.fontWeight,
                    color: propStyle.color,
                    backgroundOpacity: bgOpacity,
                    fontStyle: propStyle.fontStyle,
                    textDecoration: propStyle.textDecoration,
                    letterSpacing: propStyle.letterSpacing,
                    shadow: propStyle.shadow !== false,
                  } : undefined);

                  return {
                    id: c.id,
                    text: stripFactCategoryPrefix(String(c.properties?.text ?? "")),
                    startMs: c.startTime || 0,
                    endMs: c.endTime || 0,
                    titleStyle,
                  };
                });
              }
            }
          }
        } catch (e) {
          console.warn("Failed to fetch canonical timeline", e);
        }

        // 4. Reconcile project media (updates blob URLs to R2, removes deleted clips).
        // Restoring database timeline first prevents reconcileProjectMedia from overwriting the DB with stale localStorage state.
        state.reconcileProjectMedia(projectMediaItems);

        // 5. Fallback to generating title cards from extractedFacts if timeline has no title clips
        if (titleCards.length === 0 && extractedFacts) {
          const fallbackRows = buildTitleRowsFromFacts(extractedFacts, audio?.durationMs);
          titleCards = fallbackRows.map((row) => ({
            id: row.id,
            text: row.text,
            startMs: row.startMs,
            endMs: row.endMs,
            titleStyle: undefined, // Will fallback to default preset in store
          }));
        }

        // 6. Fetch subtitles (SRT-aligned cues + resolved style from Subtitles tab)
        let captions: { text: string; start: number; end: number; words?: { word: string; startMs: number; endMs: number }[] }[] = [];
        let subtitleStyle: SubtitleStyle | undefined;
        try {
          const subRes = await fetch(
            `/api/projects/${projectId}/subtitles${audio?.id ? `?audioAssetId=${audio.id}` : ""}`,
            { cache: "no-store" },
          );
          if (subRes.ok) {
            const subJson = await subRes.json();
            if (subJson.track) {
              subtitleStyle = resolveSubtitleStyle(
                subJson.track.stylePreset ?? "instagram_reels",
                subJson.track.customStyle ?? null,
              );
              if (subJson.track.cues) {
                captions = cuesToEditorCaptions(parseCuesJson(subJson.track.cues));
              }
            }
          }
        } catch (e) {
          console.warn("Failed to fetch subtitles", e);
        }

        // 7. Hydrate project (titles, subtitles, voice — not project display name)
        if (!cancelled) {
          if (fetchedAspect) {
            state.setAspect(fetchedAspect);
          }

          let voiceDurationSec = audio ? audio.durationMs / 1000 : 0;
          if (audio?.r2Url) {
            const probed = await probeAudioDuration(audio.r2Url);
            voiceDurationSec = Math.max(voiceDurationSec, probed);
          }
          const captionEndSec = captions.reduce((max, c) => Math.max(max, c.end), 0);
          voiceDurationSec = Math.max(voiceDurationSec, captionEndSec, 12);

          state.hydrateProject({
            titleCards: titleCards,
            captions: captions,
            subtitleStyle,
            voiceUrl: audio?.r2Url,
            voiceDuration: voiceDurationSec,
            projectMedia: projectMediaItems,
          });

          syncLegacyBridgeNow();
          resyncMedia();
          state.setPlayhead(0);
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to hydrate editor", e);
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [projectId, audio, mediaAssets, projectTitle, extractedFacts]);

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
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "oklch(0.25 0.007 260)",
            border: "1px solid oklch(1 0 0 / 12%)",
            color: "oklch(0.96 0.005 260)",
          },
        }}
      />

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
