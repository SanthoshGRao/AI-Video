"use client";
import Timeline from "./timeline";
import useStore from "./store/use-store";
import Navbar from "./navbar";
import useTimelineEvents from "./hooks/use-timeline-events";
import Scene from "./scene";
import { SceneRef } from "./scene/scene.types";
import type StateManager from "@designcombo/state";
import { editorStateManager } from "./state-manager";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCompactFontData, loadFonts } from "./utils/fonts";
import { SECONDARY_FONT, SECONDARY_FONT_URL } from "./constants/constants";
import MenuList from "./menu-list";
import { ControlItem } from "./control-item";
import { PropertyInspector } from "./property-inspector";
import { useSubtitleAutosave } from "./hooks/use-subtitle-autosave";
import { RECOMMENDED_FONTS } from "@/lib/subtitles/presets";
import CropModal from "./crop-modal/crop-modal";
import useDataState from "./store/use-data-state";
import { FONTS } from "./data/fonts";
import FloatingControl from "./control-item/floating-controls/floating-control";
import { ProjectEditorProvider } from "./context/project-editor-context";
import MenuListHorizontal from "./menu-list-horizontal";
import { useIsLargeScreen } from "@/_designcombo/hooks/use-media-query";
import { ITrackItem } from "@designcombo/types";
import useLayoutStore from "./store/use-layout-store";
import useUploadStore from "./store/use-upload-store";
import ControlItemHorizontal from "./control-item-horizontal";
import { useProjectDesign } from "./hooks/use-project-design";
import { useDesigncomboAutosave } from "./hooks/use-designcombo-autosave";
import type { ProjectAssetsInput } from "@/lib/editor/types";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { AlertTriangle } from "lucide-react";
import { useResizableSidebar } from "./hooks/use-resizable-sidebar";

const SceneContainer = ({
  sceneRef,
  stateManager,
  trackItem,
  loaded,
  isLargeScreen,
  hydrationReady,
}: {
  sceneRef: React.RefObject<SceneRef | null>;
  stateManager: StateManager;
  trackItem: ITrackItem | null;
  loaded: boolean;
  isLargeScreen: boolean;
  hydrationReady: boolean;
}) => {
  return (
    <div className="relative flex h-full w-full flex-col bg-[#eef1f6]">
      <div className="flex-1 relative overflow-hidden w-full h-full">
        <div className="flex h-full flex-1 p-3 pb-2">
          <div id="designcombo-scene-container" className="flex-1 relative overflow-hidden w-full h-full rounded-2xl border border-slate-200/80 bg-[#e8ebf2] shadow-inner">
            <CropModal />
            {hydrationReady ? (
              <Scene ref={sceneRef} stateManager={stateManager} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-950">
                <LoadingSpinner />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full relative z-10 border-t border-slate-200 bg-white">
        {hydrationReady ? (
          <Timeline stateManager={stateManager} />
        ) : null}
      </div>

      {!isLargeScreen && !trackItem && loaded && <MenuListHorizontal />}
      {!isLargeScreen && trackItem && <ControlItemHorizontal />}
    </div>
  );
};

function EditorAutosaveBridge({ children }: { children: React.ReactNode }) {
  useSubtitleAutosave();
  return <>{children}</>;
}

const MediaSidebar = () => (
    <div className="flex h-full w-full bg-[#f8fafc]">
    <MenuList />
    <div className="h-full flex-1 overflow-hidden border-r border-gray-200 bg-[#f9f9f9]">
      <ControlItem />
    </div>
  </div>
);

export type EditorProps = {
  id?: string;
  tempId?: string;
  projectTitle?: string;
  audio?: ProjectAssetsInput["audio"];
  onBackToSubtitles?: () => void;
};

const Editor = ({ id, projectTitle, audio, onBackToSubtitles }: EditorProps) => {
  const [projectName, setProjectName] = useState(projectTitle ?? "Untitled video");
  const sceneRef = useRef<SceneRef>(null);
  const { timeline } = useStore();
  const { activeIds, trackItemsMap, transitionsMap } = useStore();
  const [loaded, setLoaded] = useState(false);
  const [trackItem, setTrackItem] = useState<ITrackItem | null>(null);
  const {
    setTrackItem: setLayoutTrackItem,
    setFloatingControl,
    setLabelControlItem,
    setTypeControlItem,
  } = useLayoutStore();
  const isLargeScreen = useIsLargeScreen();
  const { sidebarWidth, handleMouseDown, isResizing } = useResizableSidebar(320, 260, 600);

  const audioInput = useMemo(
    () =>
      audio
        ? {
            id: audio.id,
            r2Url: audio.r2Url,
            durationMs: audio.durationMs,
            waveformData: audio.waveformData,
            localPath: audio.localPath ?? null,
            r2Key: audio.r2Key,
          }
        : null,
    [audio]
  );

  const { status, warnings, loaded: projectLoaded } = useProjectDesign(
    id,
    audioInput
  );

  const { uploads, activeUploads } = useUploadStore();
  
  const activeWarnings = useMemo(() => {
    let currentWarnings = [...warnings];
    const hasMedia = 
      uploads.length > 0 || 
      activeUploads.length > 0 || 
      Object.values(trackItemsMap).some(t => t.type === 'video' || t.type === 'image');
      
    if (hasMedia) {
      currentWarnings = currentWarnings.filter(w => !w.includes("No media uploaded"));
    }
    return currentWarnings;
  }, [warnings, uploads, activeUploads, trackItemsMap]);

  useTimelineEvents();
  useDesigncomboAutosave(id, editorStateManager);

  const { setCompactFonts, setFonts } = useDataState();

  useEffect(() => {
    if (projectTitle) setProjectName(projectTitle);
  }, [projectTitle]);

  useEffect(() => {
    // Filter fonts to match the subtitle page list
    const recommendedFamilies = new Set<string>(RECOMMENDED_FONTS.map((f) => f.family));
    const filteredFonts = FONTS.filter((font) =>
      recommendedFamilies.has(font.family)
    );
    setCompactFonts(getCompactFontData(filteredFonts));
    setFonts(filteredFonts);
  }, [setCompactFonts, setFonts]);

  useEffect(() => {
    loadFonts([
      {
        name: SECONDARY_FONT,
        url: SECONDARY_FONT_URL,
      },
    ]);
  }, []);

  useEffect(() => {
    // Initial timeline height handled by useResizbleTimeline hook now
  }, []);

  const handleTimelineResize = () => {
    const timelineContainer = document.getElementById("timeline-container");
    if (!timelineContainer) return;
    const h = timelineContainer.clientHeight - 90;
    const w = timelineContainer.clientWidth - 40;
    if (h <= 0 || w <= 0) return;

    try {
      timeline?.resize(
        { height: h, width: w },
        { force: true }
      );
    } catch {
      // layout measurement race during mount — safe to ignore
    }

    setTimeout(() => {
      sceneRef.current?.recalculateZoom();
    }, 100);
  };

  useEffect(() => {
    const onResize = () => handleTimelineResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [timeline]);

  useEffect(() => {
    if (activeIds.length === 1) {
      const [activeId] = activeIds;
      const item = trackItemsMap[activeId];
      if (item) {
        setTrackItem(item);
        setLayoutTrackItem(item);
      } else {
        console.log(transitionsMap[activeId]);
      }
    } else {
      setTrackItem(null);
      setLayoutTrackItem(null);
    }
  }, [activeIds, trackItemsMap, transitionsMap, setLayoutTrackItem]);

  useEffect(() => {
    setFloatingControl("");
    setLabelControlItem("");
    setTypeControlItem("");
  }, [isLargeScreen, setFloatingControl, setLabelControlItem, setTypeControlItem]);

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (status === "ready" || status === "empty") {
      const t = setTimeout(() => handleTimelineResize(), 150);
      return () => clearTimeout(t);
    }
  }, [status, timeline]);

  const hydrationReady = status === "ready" || status === "empty";
  const isLoading = status === "loading" || status === "idle";

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex h-dvh w-dvw items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="fixed inset-0 z-50 flex h-dvh w-dvw flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm font-medium">Could not load the editor</p>
        <p className="text-xs text-muted-foreground">{warnings[0]}</p>
      </div>
    );
  }

  const editorBody = (
    <div className="fixed inset-0 z-50 grid h-dvh w-dvw grid-rows-[auto_auto_1fr] overflow-hidden bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
      {activeWarnings.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          {activeWarnings.map((w) => (
            <span key={w} className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {w}
            </span>
          ))}
        </div>
      )}

      <Navbar
        projectName={projectName}
        stateManager={editorStateManager}
        setProjectName={setProjectName}
        projectId={id}
        onBackToSubtitles={onBackToSubtitles}
      />

      <div className="min-h-0 w-full overflow-hidden">
        {isLargeScreen ? (
          <div className="grid h-full w-full grid-cols-[auto_minmax(0,1fr)_320px] relative">
            <div 
              style={{ width: sidebarWidth, minWidth: 260, maxWidth: 600 }} 
              className="h-full min-h-0 relative border-r border-slate-200 bg-[#f8fafc]"
            >
              <MediaSidebar />
              <FloatingControl />
              
              {/* Drag Handle */}
              <div
                className="absolute right-[-4px] top-0 bottom-0 w-[8px] cursor-col-resize z-50 group flex items-center justify-center"
                onMouseDown={handleMouseDown}
              >
                <div className={`w-[2px] h-full transition-colors ${isResizing ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/50'}`} />
              </div>
            </div>

            <div className="min-w-0 min-h-0 h-full relative flex flex-col bg-[#eef1f6]">
              <SceneContainer
                sceneRef={sceneRef}
                stateManager={editorStateManager}
                trackItem={trackItem}
                loaded={loaded}
                isLargeScreen={isLargeScreen}
                hydrationReady={hydrationReady}
              />
            </div>

            <div className="h-full min-h-0 border-l border-slate-200 bg-[#f8fafc] relative overflow-y-auto">
              <PropertyInspector />
            </div>
          </div>
        ) : (
          <SceneContainer
            sceneRef={sceneRef}
            stateManager={editorStateManager}
            trackItem={trackItem}
            loaded={loaded}
            isLargeScreen={isLargeScreen}
            hydrationReady={hydrationReady}
          />
        )}
      </div>
    </div>
  );

  if (!id || !projectLoaded) {
    return editorBody;
  }

  return (
    <ProjectEditorProvider
      value={{
        projectId: id,
        media: projectLoaded.media,
        subtitleCues: projectLoaded.subtitleCues,
        subtitleStyle: projectLoaded.subtitleStyle,
        subtitleStylePreset: projectLoaded.subtitlePresetName ?? "instagram_reels",
        voiceoverUrl: audioInput?.r2Url ?? null,
      }}
    >
      <EditorAutosaveBridge>{editorBody}</EditorAutosaveBridge>
    </ProjectEditorProvider>
  );
};

export default Editor;
