"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import {
  PERSONAL_WORKSPACE_ID,
  useActiveWorkspaceId,
} from "@/lib/workspace/workspace-store";
import type { CreateProjectInput } from "@/lib/validations/project";
import type { AudioAsset, ContentPack, Project, ScriptVersion } from "@/types";

export type ProjectListItem = Project & {
  template?: { slug: string; name: string; icon: string } | null;
  /** Who created it — shown on cards inside a shared workspace. */
  user?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
  contentPacks?: ContentPack[];
  scriptVersions?: ScriptVersion[];
  audioAssets?: AudioAsset[];
  mediaAssets?: {
    id: string;
    r2Url: string;
    thumbnailUrl: string | null;
    type: string;
  }[];
  _count?: {
    scriptVersions: number;
    exportJobs: number;
    mediaAssets: number;
    audioAssets?: number;
    contentPacks?: number;
  };
};

/**
 * Projects in the currently selected sidebar scope — Personal, or one
 * workspace. The scope is part of the query key so switching teams swaps the
 * list instead of showing the previous team's cache.
 */
export function useProjects() {
  const workspaceId = useActiveWorkspaceId();

  return useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () =>
      apiFetch<{ projects: ProjectListItem[] }>(
        `/api/projects?workspaceId=${encodeURIComponent(workspaceId)}`
      ).then((r) => r.projects),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () =>
      apiFetch<{ project: ProjectListItem }>(`/api/projects/${id}`).then(
        (r) => r.project
      ),
    enabled: Boolean(id),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const workspaceId = useActiveWorkspaceId();

  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiFetch<{ project: ProjectListItem }>("/api/projects", {
        method: "POST",
        // New projects belong to whatever scope the sidebar is on, unless the
        // caller names one explicitly.
        body: JSON.stringify({
          workspaceId:
            workspaceId === PERSONAL_WORKSPACE_ID ? null : workspaceId,
          ...input,
        }),
      }).then((r) => r.project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDashboardStats() {
  const workspaceId = useActiveWorkspaceId();

  return useQuery({
    queryKey: ["dashboard-stats", workspaceId],
    queryFn: () =>
      apiFetch<{
        stats: {
          totalProjects: number;
          videosExported: number;
          exportsThisMonth: number;
          creditsUsed: number;
          creditsLimit: number;
        };
        recentProjects: ProjectListItem[];
        recentActivity: {
          id: string;
          eventType: string;
          metadata: unknown;
          createdAt: string;
        }[];
      }>(`/api/dashboard/stats?workspaceId=${encodeURIComponent(workspaceId)}`),
  });
}
