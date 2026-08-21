import { z } from "zod";

export const snapshotDataSchema = z.object({
  savedAt: z.string(),
  activeTab: z.string().optional(),
  selectedScriptId: z.string().nullable().optional(),
  project: z.object({
    title: z.string(),
    status: z.string(),
    propertyData: z.unknown().nullable(),
    extractedFacts: z.unknown().nullable(),
    validatedFacts: z.unknown().nullable().optional(),
    targetAudience: z.string().nullable().optional(),
    language: z.string().optional(),
    tone: z.string().optional(),
    ctaStyle: z.string().optional(),
    durationSeconds: z.number().optional(),
    lastSavedAt: z.string().optional(),
  }),
  studio: z.object({
    scriptCount: z.number(),
    hasContentPack: z.boolean().optional(),
    latestGenerationBatch: z.number().nullable().optional(),
    isEditingDetails: z.boolean().optional(),
    editedRawTextPreview: z.string().optional(),
  }),
});

export type SnapshotData = z.infer<typeof snapshotDataSchema>;

export type RecoverySnapshotRecord = {
  id: string;
  projectId: string;
  source: string;
  createdAt: string;
  expiresAt: string;
  data: SnapshotData;
};
