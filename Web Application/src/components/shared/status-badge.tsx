"use client";

import { Badge } from "@/components/ui/badge";
import type { ProjectStatus, ExportStatus } from "@/types";

const projectStatusConfig: Record<
  ProjectStatus,
  { label: string; variant: "default" | "default" | "secondary" | "destructive" | "secondary" }
> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  CONTENT_READY: { label: "Content Ready", variant: "default" },
  MEDIA_UPLOADED: { label: "Media Ready", variant: "default" },
  EDITING: { label: "Editing", variant: "secondary" },
  RENDERING: { label: "Rendering", variant: "secondary" },
  EXPORTED: { label: "Exported", variant: "default" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
};

const exportStatusConfig: Record<
  ExportStatus,
  { label: string; variant: "default" | "default" | "secondary" | "destructive" | "secondary" }
> = {
  QUEUED: { label: "Queued", variant: "secondary" },
  PROCESSING: { label: "Processing", variant: "secondary" },
  RENDERING: { label: "Rendering", variant: "secondary" },
  POST_PROCESSING: { label: "Post-Processing", variant: "secondary" },
  UPLOADING: { label: "Uploading", variant: "default" },
  DONE: { label: "Complete", variant: "default" },
  FAILED: { label: "Failed", variant: "destructive" },
};

interface StatusBadgeProps {
  type: "project" | "export";
  status: ProjectStatus | ExportStatus;
  className?: string;
}

export function StatusBadge({ type, status, className }: StatusBadgeProps) {
  const config =
    type === "project"
      ? projectStatusConfig[status as ProjectStatus]
      : exportStatusConfig[status as ExportStatus];

  if (!config) return null;

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
