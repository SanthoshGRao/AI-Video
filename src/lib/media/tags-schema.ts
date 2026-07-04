import { z } from "zod";

export const mediaTagSchema = z.object({
  tag: z
    .string()
    .min(1)
    .max(80)
    .transform((t) => {
      const s = t
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      return s || "untagged";
    }),
  confidence: z.number().min(0).max(1),
});

export const mediaAnalysisSchema = z.object({
  tags: z.array(mediaTagSchema).min(1).max(20),
  sceneDescription: z.string().max(600).optional(),
});

export type MediaAnalysisResult = z.infer<typeof mediaAnalysisSchema>;

export const manualTagBodySchema = z.object({
  tag: z.string().min(1).max(80),
});
