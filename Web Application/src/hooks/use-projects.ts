"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { CreateProjectInput } from "@/lib/validations/project";
import type { AudioAsset, ContentPack, Project, ScriptVersion } from "@/types";

export type ProjectListItem = Project & {
  template?: { slug: string; name: string; icon: string } | null;
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

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () =>
      apiFetch<{ projects: ProjectListItem[] }>("/api/projects").then(
        (r) => r.projects
      ),
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

  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiFetch<{ project: ProjectListItem }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }).then((r) => r.project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
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
      }>("/api/dashboard/stats"),
  });
}
