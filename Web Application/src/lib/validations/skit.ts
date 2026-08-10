import { z } from "zod";

/** One character's voice + delivery assignment for the skit preview. */
export const skitCastMemberSchema = z.object({
  speaker: z.string().min(1).max(60),
  voiceName: z.string().min(1).max(40),
  languageCode: z.string().min(1).max(12).optional(),
  styleId: z.string().max(40).optional(),
  customInstructions: z.string().max(4000).optional(),
  pitch: z.number().int().min(-2).max(2).optional(),
  pace: z.number().min(0.5).max(2.0).optional(),
  emotion: z.string().max(40).optional(),
  energy: z.string().max(40).optional(),
});

/** One spoken line, already parsed client-side from the raw script. */
export const skitLineSchema = z.object({
  speaker: z.string().min(1).max(60),
  text: z.string().min(1).max(1000),
  /** Stage-direction "situation" for this line — performed, never spoken. */
  context: z.string().max(800).optional(),
  /** Silence (ms) to hold before this line, from pause/beat/hold cues. */
  pauseBeforeMs: z.number().int().min(0).max(4000).optional(),
});

export const skitPreviewBodySchema = z.object({
  languageCode: z.string().min(1).max(12),
  // A preview is a short read — keep it bounded so one request can't fan out
  // into dozens of TTS calls.
  lines: z.array(skitLineSchema).min(1).max(40),
  cast: z.array(skitCastMemberSchema).max(24),
});

export type SkitCastMember = z.infer<typeof skitCastMemberSchema>;
export type SkitPreviewBody = z.infer<typeof skitPreviewBodySchema>;
