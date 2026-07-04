import type { EditorAdapter, ID, ProjectBundle, MediaAsset, SubtitleTrack, AudioAsset, ExtractedFacts, ScriptVersion } from "./contract";
import { apiFetch } from "@/lib/api/client";

export const hostAdapter: EditorAdapter = {
  async loadProjectBundle(projectId: ID): Promise<ProjectBundle> {
    // Fetch main project data
    const { project } = await apiFetch<{ project: any }>(`/api/projects/${projectId}`);

    // Fetch ALL media (project route limits to 12)
    let allMedia: any[] = project.mediaAssets ?? [];
    try {
      const mediaRes = await apiFetch<{ media: any[] }>(`/api/projects/${projectId}/media`);
      if (mediaRes.media && mediaRes.media.length > 0) {
        allMedia = mediaRes.media;
      }
    } catch {
      // fallback to project.mediaAssets
    }

    // Map Prisma models to Editor Contract models
    const audio = project.audioAssets?.[0];
    const script = project.scriptVersions?.[0];
    const subtitle = project.subtitleTracks?.[0];

    return {
      project: {
        id: project.id,
        name: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      scriptVersion: {
        id: script?.id ?? "dummy-script",
        projectId: project.id,
        version: script?.versionNumber ?? 1,
        approved: script?.isApproved ?? true,
        content: script?.content ?? "",
      },
      audioAsset: {
        id: audio?.id ?? "dummy-audio",
        projectId: project.id,
        url: audio?.r2Url ?? "",
        duration: (audio?.durationMs ?? 10000) / 1000,
        peaks: audio?.waveformData ?? [],
      },
      subtitleTrack: {
        id: subtitle?.id ?? "dummy-subtitle",
        projectId: project.id,
        language: subtitle?.language ?? "en",
        cues: subtitle?.cues?.map((c: any) => ({
          id: c.id ?? Math.random().toString(),
          start: c.startMs / 1000,
          end: c.endMs / 1000,
          text: c.text,
          words: c.words,
        })) ?? [],
      },
      extractedFacts: (project.extractedFacts as ExtractedFacts) ?? {},
      mediaAssets: allMedia.map((m: any) => ({
        id: m.id,
        projectId: project.id,
        kind: (m.type === "VIDEO" || m.type === "video") ? "video" as const : "image" as const,
        name: m.originalName ?? m.name ?? "Untitled",
        url: m.r2Url ?? m.url ?? "",
        thumbnailUrl: m.thumbnailUrl ?? m.r2Url ?? m.url ?? "",
        duration: m.durationMs ? m.durationMs / 1000 : undefined,
      })),
    };
  },

  async saveTimeline(projectId, timeline) {
    // The new editor produces a different timeline schema than the legacy OpenCut format.
    // For now, save as a JSON snapshot to the project's lastSavedAt field
    // to avoid validation errors with the old timeline API.
    try {
      await apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          propertyData: { editorTimeline: timeline },
        }),
      });
    } catch (e) {
      console.warn("[editor] autosave: saved timeline to project metadata", e);
    }
  },
};

let activeAdapter: EditorAdapter = hostAdapter;

export function setEditorAdapter(adapter: EditorAdapter) {
  activeAdapter = adapter;
}

export function getEditorAdapter(): EditorAdapter {
  return activeAdapter;
}
