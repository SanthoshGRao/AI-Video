import { z } from "zod";

export const ttsPreviewBodySchema = z.object({
  voiceName: z.string().min(1).max(40),
  languageCode: z.string().min(1).max(12),
  styleId: z.string().max(40).optional(),
  customInstructions: z.string().max(4000).optional(),
  pitch: z.number().int().min(-2).max(2).optional(),
  pace: z.number().min(0.5).max(2.0).optional(),
  emotion: z.string().max(40).optional(),
  energy: z.string().max(40).optional(),
});

export const voicePresetBodySchema = z.object({
  name: z.string().min(1).max(60),
  geminiVoice: z.string().min(1).max(40),
  languageCode: z.string().min(1).max(12),
  styleId: z.string().max(40).optional(),
  styleInstructions: z.string().min(1).max(4000),
});

export const voicePresetRenameBodySchema = z.object({
  name: z.string().min(1).max(60),
});
