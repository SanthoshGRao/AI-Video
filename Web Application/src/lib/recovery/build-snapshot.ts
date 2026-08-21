import type { Prisma } from "@/generated/prisma/client";
import type { SnapshotData } from "./types";

type ProjectForSnapshot = {
  id: string;
  title: string;
  status: string;
  propertyData: Prisma.JsonValue | null;
  extractedFacts: Prisma.JsonValue | null;
  validatedFacts: Prisma.JsonValue | null;
  targetAudience: string | null;
  language: string;
  tone: string;
  ctaStyle: string;
  durationSeconds: number;
  lastSavedAt: Date;
  scriptVersions?: { generationBatch: number }[];
  contentPacks?: unknown[];
};

export type SnapshotClientState = {
  activeTab?: string;
  selectedScriptId?: string | null;
  isEditingDetails?: boolean;
  editedRawText?: string;
};

export function buildSnapshotPayload(
  project: ProjectForSnapshot,
  client?: SnapshotClientState
): SnapshotData {
  const propertyData =
    client?.isEditingDetails && client.editedRawText !== undefined
      ? { ...(asRecord(project.propertyData) ?? {}), rawText: client.editedRawText }
      : project.propertyData;

  const batches = project.scriptVersions?.map((s) => s.generationBatch) ?? [];
  const latestGenerationBatch =
    batches.length > 0 ? Math.max(...batches) : null;

  const preview =
    client?.editedRawText?.slice(0, 200) ??
    (typeof propertyData === "object" &&
    propertyData &&
    "rawText" in propertyData &&
    typeof (propertyData as { rawText?: string }).rawText === "string"
      ? (propertyData as { rawText: string }).rawText.slice(0, 200)
      : undefined);

  return {
    savedAt: new Date().toISOString(),
    activeTab: client?.activeTab,
    selectedScriptId: client?.selectedScriptId ?? null,
    project: {
      title: project.title,
      status: project.status,
      propertyData,
      extractedFacts: project.extractedFacts,
      validatedFacts: project.validatedFacts,
      targetAudience: project.targetAudience,
      language: project.language,
      tone: project.tone,
      ctaStyle: project.ctaStyle,
      durationSeconds: project.durationSeconds,
      lastSavedAt: project.lastSavedAt.toISOString(),
    },
    studio: {
      scriptCount: project.scriptVersions?.length ?? 0,
      hasContentPack: (project.contentPacks?.length ?? 0) > 0,
      latestGenerationBatch,
      isEditingDetails: client?.isEditingDetails,
      editedRawTextPreview: preview,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
