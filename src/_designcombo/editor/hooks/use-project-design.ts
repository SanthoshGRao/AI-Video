"use client";

import { useEffect, useRef, useState } from "react";
import { dispatch } from "@designcombo/events";
import { DESIGN_LOAD } from "@designcombo/state";
import { editorStateManager } from "../state-manager";
import type { IDesign } from "@designcombo/types";
import useUploadStore from "../store/use-upload-store";
import { loadProjectAssets } from "@/lib/editor/load-project-assets";
import {
  designHasRenderableMedia,
  projectAssetsToDesign,
} from "@/lib/editor/designcombo-adapter";
import type {
  LoadedProjectAssets,
  ProjectAssetsInput,
} from "@/lib/editor/types";
import { resolveSubtitleStyle } from "@/lib/subtitles/presets";

export type ProjectDesignStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";

export function useProjectDesign(
  projectId: string | undefined,
  audio: ProjectAssetsInput["audio"]
) {
  const stateManager = editorStateManager;
  const [status, setStatus] = useState<ProjectDesignStatus>("idle");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [design, setDesign] = useState<IDesign | null>(null);
  const [loaded, setLoaded] = useState<LoadedProjectAssets | null>(null);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    loadedRef.current = null;

    useUploadStore.getState().setUploads([]);
    useUploadStore.getState().setFiles([]);
    useUploadStore.getState().clearPendingUploads();
    useUploadStore.getState().clearActiveUploads();

    let cancelled = false;
    setStatus("loading");
    setWarnings([]);

    (async () => {
      try {
        if (projectId === "test-project") {
          const nextDesign: IDesign = {
            id: "test-design",
            fps: 30,
            duration: 10000,
            size: { width: 1080, height: 1920 },
            tracks: [{ id: "track1", items: [], type: "video", muted: false, accepts: [], magnetic: false, static: false }],
            trackItemIds: [],
            trackItemsMap: {},
            transitionIds: [],
            transitionsMap: {},
            background: { type: "color", value: "#000000" }
          };
          
          stateManager.updateState(
            { size: nextDesign.size, fps: nextDesign.fps, duration: nextDesign.duration },
            { updateHistory: false }
          );
          dispatch(DESIGN_LOAD, { payload: nextDesign });
          loadedRef.current = projectId;
          setDesign(nextDesign);
          setLoaded({
            timeline: null,
            timelineId: null,
            media: [],
            subtitleCues: [],
            subtitleStyle: resolveSubtitleStyle("instagram_reels", null),
            subtitleTrackId: null,
            elements: [],
            warnings: [],
            durationMs: 10000,
          });
          setWarnings([]);
          setStatus("empty");
          return;
        }

        const loaded = await loadProjectAssets({ projectId, audio });
        if (cancelled) return;

        const aspect = loaded.timeline?.settings
          ? {
              width: loaded.timeline.settings.width,
              height: loaded.timeline.settings.height,
            }
          : undefined;

        const nextDesign = projectAssetsToDesign({
          projectId,
          loaded,
          aspect,
        });

        stateManager.updateState(
          {
            size: nextDesign.size,
            fps: nextDesign.fps,
            duration: nextDesign.duration ?? loaded.durationMs,
          },
          { updateHistory: false }
        );

        dispatch(DESIGN_LOAD, { payload: nextDesign });

        loadedRef.current = projectId;
        setDesign(nextDesign);
        setLoaded(loaded);
        setWarnings(loaded.warnings);

        if (!designHasRenderableMedia(nextDesign) && loaded.subtitleCues.length === 0) {
          setStatus("empty");
        } else {
          setStatus("ready");
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[editor] project hydration failed", e);
        setStatus("error");
        setWarnings([
          e instanceof Error ? e.message : "Failed to load project into editor",
        ]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, audio?.id, audio?.r2Url, audio?.durationMs, stateManager]);

  return { status, warnings, design, loaded };
}
