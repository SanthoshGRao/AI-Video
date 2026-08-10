import { z } from "zod";

export const characterBundleMemberSchema = z.object({
  characterName: z.string().min(1).max(60),
  voiceName: z.string().min(1).max(40),
  languageCode: z.string().min(1).max(12),
  styleId: z.string().max(40).nullable().optional(),
  customInstructions: z.string().max(4000).optional(),
  presetName: z.string().max(60).nullable().optional(),
  pitch: z.number().int().min(-2).max(2).optional(),
  pace: z.number().min(0.5).max(2.0).optional(),
  emotion: z.string().max(40).optional(),
  energy: z.string().max(40).optional(),
});

export const characterBundleBodySchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  characters: z.array(characterBundleMemberSchema).min(1).max(24),
});

export type CharacterBundleMemberInput = z.infer<typeof characterBundleMemberSchema>;
export type CharacterBundleBodyInput = z.infer<typeof characterBundleBodySchema>;
