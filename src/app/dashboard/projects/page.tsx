"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Filter,
  Grid3X3,
  List,
  FolderOpen,
  Clock,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { cn } from "@/lib/utils";
import { ProjectActionsMenu } from "@/components/projects/project-actions-menu";
import { useProjects } from "@/hooks/use-projects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ViewMode = "grid" | "list";

function formatStatus(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function getProjectThumbnail(project: {
  status: string;
  mediaAssets?: { r2Url: string; thumbnailUrl: string | null; type: string }[];
}) {
  const media = project.mediaAssets?.[0];
  if (!media) return null;
  return media.thumbnailUrl ?? (media.type === "IMAGE" ? media.r2Url : null);
}

export default function ProjectsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: projects = [], isLoading, isError, refetch } = useProjects();

  const filtered = useMemo(() => {
    let list = projects;
    if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.template?.name.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q)
    );
  }, [projects, searchQuery, statusFilter]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            Projects
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={() => router.push("/dashboard/projects/new")}
          className="shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--neutral-400)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="pl-9"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              <Filter className="w-4 h-4" />
              {statusFilter === "all"
                ? "All status"
                : formatStatus(statusFilter)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {[
              { value: "all", label: "All projects" },
              { value: "DRAFT", label: "Draft" },
              { value: "CONTENT_READY", label: "Content ready" },
              { value: "EXPORTED", label: "Exported" },
              { value: "ARCHIVED", label: "Archived" },
            ].map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onSelect={() => setStatusFilter(opt.value)}
              >
                {opt.label}
                {statusFilter === opt.value && " ✓"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center bg-[var(--bg-tertiary)] rounded-lg p-0.5 ml-auto">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "p-1.5 rounded-md transition-all",
              viewMode === "grid"
                ? "bg-white shadow-sm text-[var(--text-primary)]"
                : "text-[var(--neutral-400)] hover:text-[var(--text-primary)]"
            )}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "p-1.5 rounded-md transition-all",
              viewMode === "list"
                ? "bg-white shadow-sm text-[var(--text-primary)]"
                : "text-[var(--neutral-400)] hover:text-[var(--text-primary)]"
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : isError ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-[var(--error-600)]">
            Could not load projects. Ensure the database is connected and migrations are applied.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={FolderOpen}
            title={searchQuery ? "No matching projects" : "No projects yet"}
            description={
              searchQuery
                ? "Try a different search term."
                : "Create your first property video project. Enter property details and let AI generate scripts, voiceovers, and marketing content automatically."
            }
            actionLabel={searchQuery ? undefined : "Create Project"}
            onAction={
              searchQuery ? undefined : () => router.push("/dashboard/projects/new")
            }
          />
        </Card>
      ) : (
        <div
          className={cn(
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              : "space-y-3"
          )}
        >
          {filtered.map((project) => {
            const thumbnailUrl = getProjectThumbnail(project);

            return (
              <Card
                key={project.id}
                className="card-interactive group cursor-pointer"
                onClick={() =>
                  router.push(`/dashboard/projects/${project.id}/content`)
                }
              >
                <CardContent className="p-5">
                  <div
                    className={cn(
                      "h-48 aspect-[9/16] mx-auto rounded-xl bg-gradient-to-br from-[var(--neutral-100)] to-[var(--neutral-50)] flex items-center justify-center mb-4 overflow-hidden shadow-sm border border-[var(--border-subtle)]",
                      thumbnailUrl && "bg-cover bg-center"
                    )}
                    style={
                      thumbnailUrl
                        ? { backgroundImage: `url(${thumbnailUrl})` }
                        : undefined
                    }
                  >
                    {!thumbnailUrl && (
                      <Video className="w-8 h-8 text-[var(--neutral-300)]" />
                    )}
                  </div>

                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1">
                      {project.title}
                    </h3>
                    <div
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <ProjectActionsMenu
                        projectId={project.id}
                        projectTitle={project.title}
                        onDeleted={() => refetch()}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    {project.template && (
                      <Badge variant="secondary" className="text-[10px]">
                        {project.template.name}
                      </Badge>
                    )}
                    <Badge
                      variant={
                        project.status === "EXPORTED"
                          ? "default"
                          : project.status === "DRAFT"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-[10px] capitalize"
                    >
                      {formatStatus(project.status)}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {relativeTime(project.updatedAt)}
                    </div>
                    <div className="flex items-center gap-3">
                      <span>{project._count?.scriptVersions ?? 0} scripts</span>
                      <span>{project._count?.exportJobs ?? 0} exports</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
