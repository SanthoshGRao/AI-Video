import prisma from "@/lib/db/prisma";
import { parseCuesJson } from "@/lib/subtitles/cues";
import { parseAudioSync } from "@/lib/tts/types";

export type TimelineMediaItem = {
  id: string;
  type: string;
  originalName: string;
  tags: string[];
};

export type TimelineGenerationContext = {
  projectId: string;
  durationMs: number;
  scriptExcerpt: string;
  sentences: { text: string; startMs: number; endMs: number }[];
  subtitleCues: { text: string; startMs: number; endMs: number }[];
  media: TimelineMediaItem[];
  audio: { id: string; durationMs: number };
  subtitleTrackId: string | null;
  propertySummary: string;
};

export async function gatherTimelineContext(
  projectId: string,
  options?: { scriptVersionId?: string; audioAssetId?: string }
): Promise<TimelineGenerationContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      durationSeconds: true,
      propertyData: true,
      validatedFacts: true,
    },
  });
  if (!project) return null;

  const audio = options?.audioAssetId
    ? await prisma.audioAsset.findFirst({
        where: { id: options.audioAssetId, projectId },
      })
    : await prisma.audioAsset.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      });

  if (!audio) return null;

  const script = options?.scriptVersionId
    ? await prisma.scriptVersion.findFirst({
        where: { id: options.scriptVersionId, projectId },
      })
    : await prisma.scriptVersion.findFirst({
        where: { projectId, isActive: true },
        orderBy: { createdAt: "desc" },
      });

  const mediaRows = await prisma.mediaAsset.findMany({
    where: { projectId },
    include: { mediaTags: true },
    orderBy: { createdAt: "asc" },
  });

  const visual = mediaRows.filter((m) =>
    ["IMAGE", "VIDEO"].includes(m.type)
  );
  if (visual.length === 0) return null;

  const subtitle = await prisma.subtitleTrack.findFirst({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
  });

  const sync = parseAudioSync(audio.wordTimestamps);
  const sentences =
    sync?.sentences.map((s) => ({
      text: s.text.trim(),
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
    })) ?? [];

  const subtitleCues = subtitle
    ? parseCuesJson(subtitle.cues).map((c) => ({
        text: c.text,
        startMs: c.startMs,
        endMs: c.endMs,
      }))
    : [];

  const propertyData = project.propertyData as { rawText?: string } | null;
  const rawText = propertyData?.rawText?.trim() ?? "";
  const scriptText = script?.content?.trim() ?? "";
  const scriptExcerpt =
    scriptText.length > 4000 ? `${scriptText.slice(0, 4000)}…` : scriptText;

  let propertySummary = rawText.slice(0, 1500);
  if (!propertySummary && project.validatedFacts) {
    propertySummary = JSON.stringify(project.validatedFacts).slice(0, 1500);
  }

  return {
    projectId,
    durationMs: audio.durationMs,
    scriptExcerpt,
    sentences,
    subtitleCues: subtitleCues.slice(0, 40),
    media: visual.map((m) => ({
      id: m.id,
      type: m.type,
      originalName: m.originalName,
      tags: m.mediaTags.map((t) => t.tag),
    })),
    audio: { id: audio.id, durationMs: audio.durationMs },
    subtitleTrackId: subtitle?.id ?? null,
    propertySummary,
  };
}
