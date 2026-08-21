import { z } from "zod";

export const hashtagSetsSchema = z.object({
  set10: z.array(z.string()),
  set20: z.array(z.string()),
  set30: z.array(z.string()),
});

export const seoMetadataSchema = z.object({
  title: z.string().max(120),
  description: z.string().max(320),
  keywords: z.array(z.string()),
});

export const socialContentSchema = z.object({
  instagramCaptions: z.array(z.string()).min(1).max(5),
  facebookCopies: z.array(z.string()).min(1).max(4),
  whatsappCopies: z.array(z.string()).min(1).max(5),
  youtubeDescriptions: z.array(z.string()).min(1).max(4),
  telegramCopy: z.string(),
  ctaVariations: z.array(z.string()).min(1).max(8),
  propertyHighlights: z.array(z.string()).max(12),
  googleBusinessPost: z.string(),
  hashtagSets: hashtagSetsSchema,
  seoMetadata: seoMetadataSchema,
});

export type SocialContent = z.infer<typeof socialContentSchema>;

export const contentPackUpdateSchema = z.object({
  instagramCaptions: z.array(z.string()).optional(),
  facebookCopies: z.array(z.string()).optional(),
  whatsappCopies: z.array(z.string()).optional(),
  youtubeDescriptions: z.array(z.string()).optional(),
  telegramCopy: z.string().optional(),
  ctaVariations: z.array(z.string()).optional(),
  propertyHighlights: z.array(z.string()).optional(),
  googleBusinessPost: z.string().optional(),
  hashtagSets: hashtagSetsSchema.optional(),
  seoMetadata: seoMetadataSchema.optional(),
  selectedPlatforms: z.array(z.string()).optional(),
});

export type ContentPackUpdate = z.infer<typeof contentPackUpdateSchema>;

export type ContentPackDraft = {
  id: string;
  instagramCaptions: string[];
  facebookCopies: string[];
  whatsappCopies: string[];
  youtubeDescriptions: string[];
  telegramCopy: string;
  ctaVariations: string[];
  propertyHighlights: string[];
  googleBusinessPost: string;
  hashtagSets: { set10: string[]; set20: string[]; set30: string[] };
  seoMetadata: { title: string; description: string; keywords: string[] };
  selectedPlatforms: string[];
};

export function packToDraft(pack: {
  id?: string;
  instagramCaptions?: unknown;
  facebookCopies?: unknown;
  whatsappCopies?: unknown;
  youtubeDescriptions?: unknown;
  telegramCopy?: unknown;
  ctaVariations?: unknown;
  propertyHighlights?: unknown;
  googleBusinessPost?: unknown;
  hashtagSets?: unknown;
  seoMetadata?: unknown;
  selectedPlatforms?: unknown;
}): ContentPackDraft {
  const hashtags = (pack.hashtagSets ?? {}) as {
    set10?: string[];
    set20?: string[];
    set30?: string[];
  };
  const seo = (pack.seoMetadata ?? {}) as {
    title?: string;
    description?: string;
    keywords?: string[];
  };

  return {
    id: pack.id ?? "",
    instagramCaptions: (pack.instagramCaptions as string[]) ?? [],
    facebookCopies: (pack.facebookCopies as string[]) ?? [],
    whatsappCopies: (pack.whatsappCopies as string[]) ?? [],
    youtubeDescriptions: (pack.youtubeDescriptions as string[]) ?? [],
    telegramCopy: (pack.telegramCopy as string) ?? "",
    ctaVariations: (pack.ctaVariations as string[]) ?? [],
    propertyHighlights: (pack.propertyHighlights as string[]) ?? [],
    googleBusinessPost: (pack.googleBusinessPost as string) ?? "",
    hashtagSets: {
      set10: hashtags.set10 ?? [],
      set20: hashtags.set20 ?? [],
      set30: hashtags.set30 ?? [],
    },
    seoMetadata: {
      title: seo.title ?? "",
      description: seo.description ?? "",
      keywords: seo.keywords ?? [],
    },
    selectedPlatforms: (pack.selectedPlatforms as string[]) ?? [],
  };
}

export function draftToUpdatePayload(draft: ContentPackDraft): ContentPackUpdate {
  return {
    instagramCaptions: draft.instagramCaptions,
    facebookCopies: draft.facebookCopies,
    whatsappCopies: draft.whatsappCopies,
    youtubeDescriptions: draft.youtubeDescriptions,
    telegramCopy: draft.telegramCopy,
    ctaVariations: draft.ctaVariations,
    propertyHighlights: draft.propertyHighlights,
    googleBusinessPost: draft.googleBusinessPost,
    hashtagSets: draft.hashtagSets,
    seoMetadata: draft.seoMetadata,
    selectedPlatforms: draft.selectedPlatforms,
  };
}
