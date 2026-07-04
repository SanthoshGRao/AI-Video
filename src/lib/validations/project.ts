import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  templateSlug: z.string().min(1),
  propertyDetails: z.string().min(10),
  targetAudience: z.string().max(200).optional(),
  durationSeconds: z.number().int().min(30).max(300).default(60),
  tone: z.string().max(50).default("professional"),
  language: z.string().max(50).default("kannada_english"),
  ctaStyle: z.string().max(50).default("standard"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  propertyData: z.record(z.string(), z.unknown()).optional(),
  targetAudience: z.string().max(200).nullable().optional(),
  durationSeconds: z.number().int().min(30).max(300).optional(),
  tone: z.string().max(50).optional(),
  language: z.string().max(50).optional(),
  status: z
    .enum([
      "DRAFT",
      "CONTENT_READY",
      "MEDIA_UPLOADED",
      "EDITING",
      "RENDERING",
      "EXPORTED",
      "ARCHIVED",
    ])
    .optional(),
});
