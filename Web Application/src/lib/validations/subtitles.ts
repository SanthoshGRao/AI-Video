import { z } from "zod";

const subtitleWordSchema = z.object({
  word: z.string(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
});

const subtitleCueSchema = z.object({
  id: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  text: z.string().min(1).max(500),
  words: z.array(subtitleWordSchema).default([]),
});

export const saveSubtitlesBodySchema = z.object({
  cues: z.array(subtitleCueSchema).min(1),
  stylePreset: z.string().max(80).optional(),
  customStyle: z.record(z.string(), z.unknown()).nullable().optional(),
  isBurntIn: z.boolean().optional(),
  language: z.string().max(40).optional(),
  audioAssetId: z.string().nullable().optional(),
});

export const generateSubtitlesBodySchema = z.object({
  audioAssetId: z.string().optional(),
  maxCharsPerCue: z.number().int().min(20).max(200).optional(),
});
