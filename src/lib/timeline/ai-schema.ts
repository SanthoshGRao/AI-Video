import { z } from "zod";

export const aiSceneSchema = z.object({
  mediaAssetId: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  narrationSegment: z.string().optional(),
  transitionOut: z
    .enum(["fade", "zoom", "slide", "blur", "push"])
    .optional(),
});

export const aiTextOverlaySchema = z.object({
  text: z.string().min(1).max(120),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
});

export const aiTimelinePlanSchema = z.object({
  scenes: z.array(aiSceneSchema).min(1),
  textOverlays: z.array(aiTextOverlaySchema).default([]),
});

export type AiTimelinePlan = z.infer<typeof aiTimelinePlanSchema>;
export type AiScene = z.infer<typeof aiSceneSchema>;
