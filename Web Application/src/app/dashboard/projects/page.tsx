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
  Film,
  MessagesSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { cn } from "@/lib/utils";
import { ProjectActionsMenu } from "@/components/projects/project-actions-menu";
import { ImportProjectButton } from "@/components/projects/import-project-button";
import { useActiveWorkspace } from "@/lib/workspace/workspace-store";
import { useMe } from "@/hooks/use-me";
import { useProjects, type ProjectListItem } from "@/hooks/use-projects";
import { isSkitProject, readSkitData } from "@/lib/skit/project";
import { parseSkit } from "@/lib/skit/parse-script";
import { SkitThumbnail } from "@/components/skit/skit-thumbnail";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ViewMode = "grid" | "list";
type TypeFilter = "all" | "video" | "skit";

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

type ProjectPreview =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | null;

function getProjectThumbnail(project: {
  status: string;
  mediaAssets?: { r2Url: string; thumbnailUrl: string | null; type: string }[];
}): ProjectPreview {
  const media = project.mediaAssets ?? [];
  const thumb = media.find((m) => m.thumbnailUrl)?.thumbnailUrl;
  if (thumb) return { kind: "image", url: thumb };

  const image = media.find((m) => m.type === "IMAGE")?.r2Url;
  if (image) return { kind: "image", url: image };

  const video = media.find((m) => m.type === "VIDEO")?.r2Url;
  if (video) return { kind: "video", url: video };

  return null;
}

/** Cast of a skit project, from its script (falling back to assigned voices). */
function skitCharacters(project: ProjectListItem): string[] {
  const skit = readSkitData(project.propertyData);
  const parsed = parseSkit(skit.scriptText);
  if (parsed.characters.length) return parsed.characters;
  return Object.keys(skit.cast ?? {});
}

/** First frame of a video, via a media-fragment seek. No JS decode needed. */
function VideoPoster({ url }: { url: string }) {
  return (
    <video
      src={`${url}#t=0.1`}
      className="w-full h-full object-cover"
      muted
      playsInline
      preload="metadata"
      tabIndex={-1}
      aria-hidden
    />
  );
}

function ProjectCard({
  project,
  onOpen,
  onDeleted,
  showCreator,
  viewerId,
}: {
  project: ProjectListItem;
  onOpen: () => void;
  onDeleted: () => void;
  /** True in a shared workspace, where whose project it is actually matters. */
  showCreator?: boolean;
  viewerId?: string | null;
}) {
  const isSkit = isSkitProject(project.propertyData);
  const chars = isSkit ? skitCharacters(project) : [];
  const preview = isSkit ? null : getProjectThumbnail(project);

  return (
    <Card className="card-interactive group cursor-pointer" onClick={onOpen}>
      <CardContent className="p-5">
        <div
          className={cn(
            "rounded-xl flex items-center justify-center mb-4 overflow-hidden shadow-sm border border-[var(--border-subtle)]",
            isSkit
              ? "w-full h-32"
              : "h-48 aspect-[9/16] mx-auto bg-gradient-to-br from-[var(--neutral-100)] to-[var(--neutral-50)]",
            !isSkit && preview?.kind === "image" && "bg-cover bg-center"
          )}
          style={
            !isSkit && preview?.kind === "image"
              ? { backgroundImage: `url(${preview.url})` }
              : undefined
          }
        >
          {isSkit ? (
            <SkitThumbnail />
          ) : preview?.kind === "video" ? (
            <VideoPoster url={preview.url} />
          ) : !preview ? (
            <Video className="w-8 h-8 text-[var(--neutral-300)]" />
          ) : null}
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
              workspaceId={project.workspaceId}
              canMove={!viewerId || project.userId === viewerId}
              onDeleted={onDeleted}
            />
          </div>
        </div>

        {showCreator && project.user && project.user.id !== viewerId && (
          <p className="text-[11px] text-[var(--text-tertiary)] mb-2 truncate">
            by {project.user.name || project.user.email}
          </p>
        )}

        <div className="flex items-center gap-2 mb-3">
          {isSkit ? (
            <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
              Conversation
            </Badge>
          ) : project.template ? (
            <Badge variant="secondary" className="text-[10px]">
              {project.template.name}
            </Badge>
          ) : null}
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
            {isSkit ? (
              <span>{chars.length} {chars.length === 1 ? "character" : "characters"}</span>
            ) : (
              <>
                <span>{project._count?.scriptVersions ?? 0} scripts</span>
                <span>{project._count?.exportJobs ?? 0} exports</span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: projects = [], isLoading, isError, refetch } = useProjects();
  const { activeWs, isPersonal } = useActiveWorkspace();
  const { data: me } = useMe();

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

  const videoProjects = useMemo(
    () => filtered.filter((p) => !isSkitProject(p.propertyData)),
    [filtered]
  );
  const skitProjects = useMemo(
    () => filtered.filter((p) => isSkitProject(p.propertyData)),
    [filtered]
  );

  const containerClass = cn(
    viewMode === "grid"
      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      : "space-y-3"
  );

  const renderGroup = (list: ProjectListItem[]) => (
    <div className={containerClass}>
      {list.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onOpen={() => router.push(`/dashboard/projects/${project.id}/content`)}
          onDeleted={() => refetch()}
          showCreator={!isPersonal}
          viewerId={me?.id ?? null}
        />
      ))}
    </div>
  );

  const typeTabs: { value: TypeFilter; label: string; icon?: typeof Film }[] = [
    { value: "all", label: "All" },
    { value: "video", label: "Videos", icon: Film },
    { value: "skit", label: "Conversations", icon: MessagesSquare },
  ];

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
            {!isPersonal && (
              <span className="font-medium text-[#2E8F63]">
                {activeWs?.name} ·{" "}
              </span>
            )}
            {videoProjects.length} video{videoProjects.length !== 1 ? "s" : ""} · {skitProjects.length} conversation{skitProjects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportProjectButton />
          <Button onClick={() => router.push("/dashboard/projects/new")} className="shadow-sm">
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--neutral-400)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="pl-9"
          />
        </div>

        {/* Type segmented control */}
        <div className="flex items-center bg-[var(--bg-tertiary)] rounded-lg p-0.5">
          {typeTabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                typeFilter === t.value
                  ? "bg-white shadow-sm text-[var(--text-primary)]"
                  : "text-[var(--neutral-500)] hover:text-[var(--text-primary)]"
              )}
            >
              {t.icon && <t.icon className="w-3.5 h-3.5" />}
              {t.label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              <Filter className="w-4 h-4" />
              {statusFilter === "all" ? "All status" : formatStatus(statusFilter)}
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
              <DropdownMenuItem key={opt.value} onSelect={() => setStatusFilter(opt.value)}>
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
              searchQuery ? "Try a different search term." : "Create your first project to get started."
            }
            actionLabel={searchQuery ? undefined : "Create Project"}
            onAction={searchQuery ? undefined : () => router.push("/dashboard/projects/new")}
          />
        </Card>
      ) : typeFilter !== "all" ? (
        (() => {
          const list = typeFilter === "video" ? videoProjects : skitProjects;
          if (list.length === 0) {
            return (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-sm text-[var(--text-secondary)]">
                  No {typeFilter === "video" ? "video" : "conversation"} projects yet.
                </CardContent>
              </Card>
            );
          }
          return renderGroup(list);
        })()
      ) : (
        <div className="space-y-8">
          {videoProjects.length > 0 && (
            <TypeSection icon={Film} label="Property Videos" count={videoProjects.length} accent="var(--primary-600)">
              {renderGroup(videoProjects)}
            </TypeSection>
          )}
          {skitProjects.length > 0 && (
            <TypeSection icon={MessagesSquare} label="Conversations" count={skitProjects.length} accent="#6366f1">
              {renderGroup(skitProjects)}
            </TypeSection>
          )}
        </div>
      )}
    </motion.div>
  );
}

function TypeSection({
  icon: Icon,
  label,
  count,
  accent,
  children,
}: {
  icon: typeof Film;
  label: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}14`, color: accent }}
        >
          <Icon className="w-4 h-4" />
        </span>
        <h2 className="text-sm font-bold text-[var(--text-primary)]">{label}</h2>
        <span className="text-xs font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] rounded-full px-2 py-0.5">
          {count}
        </span>
        <div className="flex-1 h-px bg-[var(--border-subtle)] ml-1" />
      </div>
      {children}
    </section>
  );
}
