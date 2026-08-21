import prisma from "@/lib/db/prisma";
import { cuesToEditorCaptions, parseCuesJson } from "@/lib/subtitles/cues";
import { resolveSubtitleStyle, TITLE_FACT_CATEGORY_LABELS, stripFactCategoryPrefix } from "@/lib/subtitles/presets";
import type { SubtitleStyle } from "@/lib/subtitles/types";
import { serializeAudioAsset, serializeMediaAsset } from "@/lib/storage/serialize";
import { serializeTimeline } from "@/lib/timeline/serialize";
import { layoutFactTimings } from "@/lib/facts/overlay-timing";

function titleTextFromValue(key: string, value: unknown): string[] {
  const label = TITLE_FACT_CATEGORY_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").trim();
  if (value == null || value === "") return [];
  if (typeof value === "boolean") return value ? [label] : [];
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s ? [stripFactCategoryPrefix(s)] : [];
  }
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (item == null || item === "") return [];
    if (typeof item === "string" || typeof item === "number") {
      const s = String(item).trim();
      return s ? [stripFactCategoryPrefix(s)] : [];
    }
    if (typeof item === "object") {
      const values = Object.values(item as Record<string, unknown>)
        .filter((v) => v != null && v !== "")
        .join(" ");
      return values ? [stripFactCategoryPrefix(values)] : [];
    }
    return [];
  });
}

function buildTitleRowsFromFacts(facts: unknown, durationMs?: number): any[] {
  const existingRows = Array.isArray(facts)
    ? facts.filter((fact): fact is any => typeof fact?.text === "string")
    : [];
  
  const texts: any[] = existingRows.length > 0
    ? existingRows.map((fact) => ({
      id: typeof fact.id === "string" ? fact.id : undefined,
      text: fact.text,
      category: fact.category,
      startMs: typeof fact.startMs === "number" ? fact.startMs : undefined,
      endMs: typeof fact.endMs === "number" ? fact.endMs : undefined,
    }))
    : facts && typeof facts === "object"
      ? Object.entries(facts as Record<string, unknown>).flatMap(([key, value]) =>
        titleTextFromValue(key, value).map((text, index) => ({
          id: `${key}-${index}`,
          text,
          category: TITLE_FACT_CATEGORY_LABELS[key] ?? key,
        }))
      )
      : [];

  const visibleTexts = texts.filter((row) => row.text.trim()).slice(0, 8);
  if (visibleTexts.length === 0) return [];

  // Facts aligned against the subtitle cues carry their own start times — keep
  // them exactly where they were spoken. Only unaligned facts (the raw
  // extracted-facts object, no cue alignment yet) get evenly spread slots.
  const totalMs = Math.max(durationMs ?? 0, visibleTexts.length * 3000, 3000);
  const slotMs = Math.max(2500, Math.floor(totalMs / visibleTexts.length));

  const rows = visibleTexts.map((row, index) => ({
    id: row.id ?? `title-${index}`,
    text: row.text.trim(),
    category: row.category,
    startMs: row.startMs ?? index * slotMs,
    endMs: row.endMs ?? Math.min(totalMs, (row.startMs ?? index * slotMs) + slotMs),
  }));

  // Stretch each title to the next one's start (last → end of video) so the
  // title track spans the whole video alongside the subtitles.
  return layoutFactTimings(rows, { totalDurationMs: totalMs });
}

export async function getEditorBootstrap(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      mediaAssets: {
        orderBy: { createdAt: "desc" },
      },
      audioAssets: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      subtitleTracks: {
        orderBy: { createdAt: "desc" },
      },
      timelines: {
        orderBy: [
          { version: "desc" },
          { createdAt: "desc" }
        ],
        take: 1,
      }
    }
  });

  if (!project) return null;

  const audio = project.audioAssets[0];
  const timeline = project.timelines[0];

  // Resolve the ACTIVE subtitle track the same way GET /api/projects/[id]/subtitles
  // does — via the sticky `timeline.settings.subtitleTrackId` — rather than just
  // grabbing the newest track. Without this, generating a translation or
  // regenerating captions creates a newer SubtitleTrack row than the one the
  // user was actually styling in the Subtitle Studio panel, so the editor
  // seeded the wrong (default-styled) track's font/style on first load.
  const activeSubtitleTrackId = (timeline?.settings as { subtitleTrackId?: string } | null)?.subtitleTrackId;
  const subtitles = (activeSubtitleTrackId && activeSubtitleTrackId !== "force-rebuild"
    ? project.subtitleTracks.find((t) => t.id === activeSubtitleTrackId)
    : undefined) ?? project.subtitleTracks[0];

  let captions = undefined;
  if (subtitles?.cues) {
    captions = cuesToEditorCaptions(parseCuesJson(subtitles.cues));
  }

  let titleCards: any[] = [];
  
  if (timeline?.clips && typeof timeline.clips === "object") {
    const clips = Object.values(timeline.clips) as any[];
    
    // 1. Try to find user custom titles (category === "title")
    let titleClips = clips.filter((c: any) => {
      if (c?.type !== "text" && c?.kind !== "text" && c?.kind !== "subtitle") return false;
      const meta = c?.properties?.textOverlayMeta;
      const isSubtitle = c?.trackId === "track-subtitle" || meta?.category === "subtitle";
      if (isSubtitle) return false;
      return meta?.category === "title";
    });
    
    // 2. If no custom titles, fallback to auto-generated fact/title clips
    if (titleClips.length === 0) {
      titleClips = clips.filter((c: any) => {
        if (c?.type !== "text" && c?.kind !== "text" && c?.kind !== "subtitle") return false;
        const meta = c?.properties?.textOverlayMeta;
        const isSubtitle = c?.trackId === "track-subtitle" || meta?.category === "subtitle";
        if (isSubtitle) return false;
        return meta?.isAutoGenerated === true || c?.trackId === "track-facts" || c?.trackId === "track-text";
      });
    }

    titleCards = titleClips.map((c: any) => {
      const metaStyle = c.properties?.textOverlayMeta?.titleStyle;
      const propStyle = c.properties?.style;
      const bgOpacity = propStyle?.backgroundColor?.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)
        ? Math.round(parseFloat(propStyle.backgroundColor.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)[1]) * 100)
        : 0;

      const titleStyle = metaStyle || (propStyle ? {
        fontFamily: propStyle.fontFamily,
        fontSize: propStyle.fontSize,
        fontWeight: propStyle.fontWeight,
        color: propStyle.color,
        backgroundOpacity: bgOpacity,
        fontStyle: propStyle.fontStyle,
        textDecoration: propStyle.textDecoration,
        letterSpacing: propStyle.letterSpacing,
        shadow: propStyle.shadow !== false,
      } : undefined);

      return {
        id: c.id,
        text: c.properties?.text || "",
        startMs: c.startTime || 0,
        endMs: c.endTime || 0,
        titleStyle,
      };
    });
  }

  // 3. Fallback to generating title cards from extractedFacts if timeline has no title clips
  if (titleCards.length === 0 && project.extractedFacts) {
    const fallbackRows = buildTitleRowsFromFacts(project.extractedFacts, audio?.durationMs);
    titleCards = fallbackRows.map((row) => ({
      id: row.id,
      text: row.text,
      startMs: row.startMs,
      endMs: row.endMs,
      titleStyle: undefined, // Will fallback to default preset in store
    }));
  }

  // The editor's global media library (uploaded via /api/media/upload/global,
  // browsed at /dashboard/library) lives on MediaAsset rows with projectId
  // unrelated to this project (often null). Dragging one of those onto this
  // project's timeline only ever recorded it in the *timeline's* clip JSON —
  // it never reassigned the MediaAsset's projectId. So a project-scoped
  // `project.mediaAssets` list alone misses any such clip's media, and the
  // editor's cross-project media guard (scopeUserMediaToProject) then treats
  // it as "not part of this project" and strips it out on every load —
  // silently deleting the clip from the timeline on the very next autosave.
  // Pull in whatever the saved timeline actually references, regardless of
  // which project (or no project) the asset row lives under, as long as it
  // belongs to this user.
  const referencedMediaAssetIds = new Set<string>();
  if (timeline?.clips && typeof timeline.clips === "object") {
    for (const c of Object.values(timeline.clips) as any[]) {
      if (typeof c?.mediaAssetId === "string") referencedMediaAssetIds.add(c.mediaAssetId);
    }
  }
  // Panel contents persisted in settings — covers library imports that were
  // added to the project's media panel but not (yet) placed on the timeline.
  const settingsMediaIds = (timeline?.settings as { projectMediaIds?: unknown } | null)?.projectMediaIds;
  if (Array.isArray(settingsMediaIds)) {
    for (const id of settingsMediaIds) {
      if (typeof id === "string") referencedMediaAssetIds.add(id);
    }
  }
  const knownAssetIds = new Set(project.mediaAssets.map((m) => m.id));
  const missingAssetIds = [...referencedMediaAssetIds].filter((id) => !knownAssetIds.has(id));
  const externallyReferencedAssets = missingAssetIds.length
    ? await prisma.mediaAsset.findMany({ where: { id: { in: missingAssetIds }, userId } })
    : [];

  // Serialize media assets with resolved URLs
  const mediaAssets = [...project.mediaAssets, ...externallyReferencedAssets].map((m) => {
    const serialized = serializeMediaAsset(m);
    return {
      mediaAssetId: m.id,
      name: m.originalName,
      kind: (m.type === "DOCUMENT" || m.mimeType.startsWith("audio/")) ? "audio"
        : (m.type === "VIDEO" || m.mimeType.startsWith("video/")) ? "video"
        : "image" as const,
      src: serialized.r2Url,
      duration: Math.round((m.durationMs || 0) / 1000),
      size: m.fileSizeBytes ?? 0,
      thumb: serialized.thumbnailUrl ?? undefined,
      source: "upload" as const,
    };
  });

  // Prepend generated voiceover if present, tagged as voiceover source
  const voiceoverMedia = audio ? [{
    id: `voiceover-${audio.id}`,
    mediaAssetId: undefined,
    name: "AI Generated Voiceover",
    kind: "audio" as const,
    src: serializeAudioAsset(audio).r2Url,
    duration: Math.round((audio.durationMs || 0) / 1000),
    size: 0,
    thumb: undefined,
    source: "voiceover" as const,
  }] : [];

  return {
    title: project.title,
    voiceUrl: audio ? serializeAudioAsset(audio).r2Url : undefined,
    voiceDuration: audio ? audio.durationMs / 1000 : undefined,
    captions,
    titleCards,
    subtitleStyle: resolveSubtitleStyle(
      subtitles?.stylePreset ?? "instagram_reels",
      subtitles?.customStyle ? (subtitles.customStyle as SubtitleStyle) : null,
    ),
    projectMedia: [...voiceoverMedia, ...mediaAssets],
    // The actual saved editor state (clips/tracks/elements/transitions).
    // Previously only `titleCards` were mined out of this row and the rest
    // was discarded, so the editor only ever loaded from localStorage —
    // any save that didn't make it into (or survive in) this browser's
    // localStorage looked like it had silently failed on the next visit.
    timeline: timeline ? serializeTimeline(timeline) : null,
  };
}
