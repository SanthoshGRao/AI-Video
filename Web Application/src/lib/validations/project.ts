import { z } from "zod";

export const createProjectSchema = z
  .object({
    // "standard" = the AI property-video flow; "skit" = the hand-written
    // multi-character conversation flow. Defaults to standard in the route so
    // existing callers (which never send `kind`) keep working unchanged.
    kind: z.enum(["standard", "skit"]).optional(),
    title: z.string().min(1).max(200),
    // Only required for standard projects (enforced in superRefine below).
    templateSlug: z.string().min(1).optional(),
    propertyDetails: z.string().optional(),
    targetAudience: z.string().max(200).optional(),
    durationSeconds: z.number().int().min(30).max(300).default(60),
    tone: z.string().max(50).default("professional"),
    language: z.string().max(50).default("kannada_english"),
    ctaStyle: z.string().max(50).default("standard"),
    // Skit-only: the initial script text and its TTS language code (e.g. "kn-IN").
    skitScript: z.string().max(20000).optional(),
    skitLanguage: z.string().max(12).optional(),
  })
  .superRefine((val, ctx) => {
    if ((val.kind ?? "standard") === "standard") {
      if (!val.templateSlug) {
        ctx.addIssue({ code: "custom", message: "templateSlug is required", path: ["templateSlug"] });
      }
      if (!val.propertyDetails || val.propertyDetails.trim().length < 10) {
        ctx.addIssue({ code: "custom", message: "propertyDetails must be at least 10 characters", path: ["propertyDetails"] });
      }
    }
  });

// Use the INPUT type so fields with `.default()` (durationSeconds, tone,
// language, ctaStyle) and `kind` are optional for callers — the schema fills
// the defaults server-side.
export type CreateProjectInput = z.input<typeof createProjectSchema>;

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
