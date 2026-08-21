"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useProject } from "@/hooks/use-projects";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { readSkitData } from "@/lib/skit/project";
import { SkitStudio } from "./skit-studio";
import type { CastAssignment } from "./types";

/**
 * Wraps the Skit Studio for a single project: hydrates the initial script/cast
 * from `project.propertyData.skit` and persists edits back to it.
 */
export function SkitProjectShell({ projectId }: { projectId: string }) {
  const { data: project, isLoading, isError } = useProject(projectId);

  const persist = useCallback(
    (data: { scriptText: string; language: string; cast: Record<string, CastAssignment> }) => {
      void fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyData: { kind: "skit", skit: data } }),
      }).catch(() => {});
    },
    [projectId]
  );

  if (isLoading) {
    return (
      <div className="py-24 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (isError || !project) {
    return (
      <div className="py-24 text-center text-sm text-[var(--text-secondary)]">
        Couldn&apos;t load this project.
      </div>
    );
  }

  const skit = readSkitData(project.propertyData);

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/projects"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="w-4 h-4" />
        Projects
      </Link>
      <SkitStudio
        projectId={projectId}
        projectTitle={project.title}
        initial={{
          scriptText: skit.scriptText,
          language: skit.language,
          cast: skit.cast as Record<string, CastAssignment>,
        }}
        onPersist={persist}
      />
    </div>
  );
}
