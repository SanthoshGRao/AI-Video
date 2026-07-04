import { useEffect, useMemo, useState } from "react";
import useStore from "./store/use-store";
import { ExportModal } from "@/components/export/export-modal";
import { Button } from "@/components/ui/button";
import { dispatch } from "@designcombo/events";
import { HISTORY_UNDO, HISTORY_REDO, DESIGN_RESIZE } from "@designcombo/state";
import { Icons } from "@/_designcombo/shared/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  ChevronLeft,
  Download,
  Keyboard,
  Play,
  ProportionsIcon,
  Save,
  Loader2
} from "lucide-react";
import { Label } from "@/components/ui/label";

import type StateManager from "@designcombo/state";
import {
  buildMediaUrlIndex,
  designStateToTimelineDocument,
} from "@/lib/editor/designcombo-to-timeline";
import AutosizeInput from "@/components/ui/autosize-input";
import { useUIStore } from "@/stores/ui-store";
import { debounce } from "lodash";
import {
  useIsLargeScreen,
  useIsMediumScreen,
  useIsSmallScreen,
} from "@/_designcombo/hooks/use-media-query";
import { useProjectEditor } from "./context/project-editor-context";

import { ShortcutsModal } from "./shortcuts-modal";

export default function Navbar({
  stateManager,
  setProjectName,
  projectName,
  projectId,
  onBackToSubtitles,
}: {
  stateManager: StateManager;
  setProjectName: (name: string) => void;
  projectName: string;
  projectId?: string;
  onBackToSubtitles?: () => void;
}) {
  const [title, setTitle] = useState(projectName);
  const isLargeScreen = useIsLargeScreen();
  const isSmallScreen = useIsSmallScreen();
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const projectEditor = useProjectEditor();

  const [isAutosaveEnabled, setIsAutosaveEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("designcombo-autosave") === "true";
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("designcombo-autosave", String(isAutosaveEnabled));
    }
  }, [isAutosaveEnabled]);

  const addToast = useUIStore((s) => s.addToast);

  const handleSave = async (isAutosave = false) => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      const state = stateManager.getState();
      const mediaIndex = projectEditor?.media
        ? buildMediaUrlIndex(projectEditor.media)
        : undefined;
      const doc = designStateToTimelineDocument(
        {
          tracks: state.tracks,
          trackItemsMap: state.trackItemsMap,
          trackItemIds: state.trackItemIds,
          size: state.size,
          duration: state.duration,
          fps: state.fps,
        },
        mediaIndex
      );
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracks: doc.tracks,
          clips: doc.clips,
          transitions: doc.transitions,
          textLayers: doc.textLayers,
          settings: doc.settings,
          isAutosave,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save timeline.");
      }
      if (!isAutosave) {
        addToast({ type: "success", title: "Saved", description: "Project saved successfully." });
      }
    } catch (error: any) {
      console.error("Failed to save project", error);
      addToast({ type: "error", title: "Save failed", description: error?.message || "An unexpected error occurred while saving." });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isAutosaveEnabled || !projectId) return;

    const saveDebounced = debounce(() => {
      handleSave(true);
    }, 2000);

    const unsub = useStore.subscribe((state, prevState) => {
      if (
        state.trackItemsMap !== prevState.trackItemsMap ||
        state.tracks !== prevState.tracks ||
        state.duration !== prevState.duration
      ) {
        saveDebounced();
      }
    });

    return () => {
      unsub();
      saveDebounced.cancel();
    };
  }, [isAutosaveEnabled, projectId]);

  const handleUndo = () => {
    dispatch(HISTORY_UNDO);
  };

  const handleRedo = () => {
    dispatch(HISTORY_REDO);
  };

  const debouncedSetProjectName = useMemo(
    () =>
    debounce((name: string) => {
      setProjectName(name);
    }, 500),
    [setProjectName]
  );

  // Update the debounced function whenever the title changes
  useEffect(() => {
    debouncedSetProjectName(title);
  }, [title, debouncedSetProjectName]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isLargeScreen ? "minmax(260px, 360px) 1fr minmax(300px, 380px)" : "1fr auto 1fr"
      }}
      className="pointer-events-none h-14 items-center border-b border-white/10 bg-[#111827] px-3 text-white shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-2">
        {onBackToSubtitles ? (
          <Button
            onClick={onBackToSubtitles}
            className="pointer-events-auto h-8 gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-white/85 hover:bg-white/10 hover:text-white"
            variant="ghost"
            size="sm"
            title="Back to subtitles"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden lg:inline">Subtitles</span>
          </Button>
        ) : null}

        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button
            onClick={handleUndo}
            className="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
            variant="ghost"
            size="icon"
            title="Undo (Ctrl+Z)"
          >
            <Icons.undo width={20} />
          </Button>
          <Button
            onClick={handleRedo}
            className="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
            variant="ghost"
            size="icon"
            title="Redo (Ctrl+Y)"
          >
            <Icons.redo width={20} />
          </Button>
        </div>

        <div className="pointer-events-auto flex items-center ml-2">
          <button
            onClick={() => setIsAutosaveEnabled(!isAutosaveEnabled)}
            className={`relative flex items-center h-8 gap-2 px-3 rounded-md transition-all duration-300 border ${
              isAutosaveEnabled 
                ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200" 
                : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
            }`}
            title="Toggle Auto-save"
          >
            <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
              isAutosaveEnabled ? "bg-indigo-400 shadow-[0_0_8px_2px_rgba(129,140,248,0.6)]" : "bg-white/40"
            }`} />
            <span className="hidden lg:inline text-xs font-semibold tracking-wide">
              {isAutosaveEnabled ? "Auto-Save ON" : "Auto-Save OFF"}
            </span>
          </button>
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-center gap-2">
        {!isSmallScreen && (
          <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1">
            <AutosizeInput
              name="title"
              value={title}
              onChange={handleTitleChange}
              width={200}
              inputClassName="border-none outline-none px-2 py-1 bg-transparent text-center text-white text-sm font-semibold focus:bg-white/10 rounded-md transition-colors placeholder-white/60"
            />
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <ResizeVideo />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-3 text-white/85 hover:bg-white/10 hover:text-white"
            title="Preview video (Space)"
            onClick={() => {
              const container = document.getElementById("designcombo-scene-container");
              if (container && !document.fullscreenElement) {
                container.requestFullscreen().catch(err => console.error(err));
              }
              const player = useStore.getState().playerRef?.current;
              if (player) {
                player.seekTo(0);
                player.play();
                const checkEnd = setInterval(() => {
                  if (!document.fullscreenElement) {
                    clearInterval(checkEnd);
                    return;
                  }
                  const state = useStore.getState();
                  const currentFrame = player.getCurrentFrame();
                  const durationInFrames = (state.duration / 1000) * state.fps;
                  if (currentFrame >= durationInFrames - 1) {
                    document.exitFullscreen().catch(() => {});
                    clearInterval(checkEnd);
                  }
                }, 200);
              }
            }}
          >
            <Play className="h-4 w-4" />
            <span className="hidden lg:inline">Preview</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => setIsShortcutsModalOpen(true)}
            title="Keyboard shortcuts"
          >
            <Keyboard className="size-5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="h-8 gap-1.5 px-3 text-white/85 hover:bg-white/10 hover:text-white"
            title="Save Project"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="hidden lg:inline">{isSaving ? "Saving..." : "Save"}</span>
          </Button>
          <DownloadPopover />
        </div>
      </div>
      <ShortcutsModal
        open={isShortcutsModalOpen}
        onOpenChange={setIsShortcutsModalOpen}
      />
    </div>
  );
}

const DownloadPopover = () => {
  const isMediumScreen = useIsMediumScreen();
  const [open, setOpen] = useState(false);
  const [isClientExportModalOpen, setIsClientExportModalOpen] = useState(false);

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="flex h-8 gap-1 rounded-lg bg-white px-4 font-semibold text-black hover:bg-gray-100"
          size={isMediumScreen ? "sm" : "default"}
        >
          <Download width={16} />{" "}
          <span className="hidden md:block">Download</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="bg-sidebar z-[250] flex w-60 flex-col gap-4"
      >
        <Label>Export Video</Label>

        <div className="flex flex-col gap-2">
          <Button onClick={() => { setOpen(false); setIsClientExportModalOpen(true); }} className="w-full">
            Export in Browser
          </Button>
        </div>
      </PopoverContent>
    </Popover>
    
    <ExportModal 
      open={isClientExportModalOpen} 
      onOpenChange={setIsClientExportModalOpen} 
    />
    </>
  );
};

interface ResizeOptionProps {
  label: string;
  icon: string;
  value: ResizeValue;
  description: string;
}

interface ResizeValue {
  width: number;
  height: number;
  name: string;
}

const RESIZE_OPTIONS: ResizeOptionProps[] = [
  {
    label: "16:9",
    icon: "landscape",
    description: "YouTube ads",
    value: {
      width: 1920,
      height: 1080,
      name: "16:9"
    }
  },
  {
    label: "9:16",
    icon: "portrait",
    description: "TikTok, YouTube Shorts",
    value: {
      width: 1080,
      height: 1920,
      name: "9:16"
    }
  },
  {
    label: "1:1",
    icon: "square",
    description: "Instagram, Facebook posts",
    value: {
      width: 1080,
      height: 1080,
      name: "1:1"
    }
  }
];

const ResizeVideo = () => {
  const handleResize = (options: ResizeValue) => {
    dispatch(DESIGN_RESIZE, {
      payload: {
        ...options
      }
    });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-3 text-white/85 hover:bg-white/10 hover:text-white"
          title="Change aspect ratio / resolution"
        >
          <ProportionsIcon className="h-4 w-4" />
          <span className="hidden lg:inline">Resize</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[250] w-60 px-2.5 py-3">
        <div className="text-sm">
          {RESIZE_OPTIONS.map((option, index) => (
            <ResizeOption
              key={index}
              label={option.label}
              icon={option.icon}
              value={option.value}
              handleResize={handleResize}
              description={option.description}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ResizeOption = ({
  label,
  icon,
  value,
  description,
  handleResize
}: ResizeOptionProps & { handleResize: (payload: ResizeValue) => void }) => {
  const Icon = Icons[icon as "text"];
  return (
    <div
      onClick={() => handleResize(value)}
      className="flex cursor-pointer items-center rounded-md p-2 hover:bg-zinc-50/10"
    >
      <div className="w-8 text-muted-foreground">
        <Icon size={20} />
      </div>
      <div>
        <div>{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  );
};
