"use client";

import { createContext, useContext } from "react";
import type { LoadedProjectAssets } from "@/lib/editor/types";
import type { SubtitleCue, SubtitleStyle } from "@/lib/subtitles/types";

export type ProjectEditorContextValue = {
  projectId: string;
  media: LoadedProjectAssets["media"];
  subtitleCues?: SubtitleCue[];
  subtitleStyle?: SubtitleStyle;
  subtitleStylePreset?: string;
  voiceoverUrl?: string | null;
};

const ProjectEditorContext = createContext<ProjectEditorContextValue | null>(
  null
);

export function ProjectEditorProvider({
  value,
  children,
}: {
  value: ProjectEditorContextValue;
  children: React.ReactNode;
}) {
  return (
    <ProjectEditorContext.Provider value={value}>
      {children}
    </ProjectEditorContext.Provider>
  );
}

export function useProjectEditor() {
  return useContext(ProjectEditorContext);
}
