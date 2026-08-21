import { parseTimelineRow, syncTrackClipIds } from "@/lib/timeline/parse";
import { parseCuesJson } from "@/lib/subtitles/cues";
import { resolveSubtitleStyle, SUBTITLE_STYLE_PRESETS } from "@/lib/subtitles/presets";
import type { SubtitleStyle, SubtitleCue } from "@/lib/subtitles/types";
import {
  timelineDocumentToElements,
  DEFAULT_EDITOR_TRACKS,
  getSubtitlesFromTimeline,
} from "@/lib/editor/timeline-adapter";
import type { LoadedProjectAssets, ProjectAssetsInput } from "@/lib/editor/types";
import { layoutFactTimings } from "@/lib/facts/overlay-timing";
// Key facts are now aligned via AI in the subtitle studio

function wordWrap(text: string, maxChars: number = 35): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + word).length > maxChars) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word + " ";
    } else {
      currentLine += word + " ";
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines.join("\n");
}

export async function loadProjectAssets(
  input: ProjectAssetsInput
): Promise<LoadedProjectAssets> {
  const { projectId, audio } = input;
  const warnings: string[] = [];

  const [mediaRes, timelineRes, subtitlesRes] = await Promise.all([
    fetch(`/api/media?scope=all`, { cache: "no-store" }),
    fetch(`/api/projects/${projectId}/timeline`, { cache: "no-store" }),
    fetch(`/api/projects/${projectId}/subtitles`, { cache: "no-store" }),
  ]);

  const mediaJson = mediaRes.ok
    ? ((await mediaRes.json()) as { media: LoadedProjectAssets["media"] })
    : { media: [] };
  if (!mediaRes.ok) warnings.push("Could not load media library");

  const timelineJson = timelineRes.ok
    ? ((await timelineRes.json()) as {
        timeline: {
          id: string;
          tracks: unknown;
          clips: unknown;
          transitions?: unknown;
          textLayers?: unknown;
          settings?: unknown;
        } | null;
      })
    : { timeline: null };

  const projectRes = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
  const projectJson = projectRes.ok ? await projectRes.json() : null;
  const extractedFacts = projectJson?.project?.extractedFacts || [];

  const subtitlesJson = subtitlesRes.ok
    ? ((await subtitlesRes.json()) as {
        track: {
          id: string;
          cues: unknown;
          stylePreset: string;
          customStyle: unknown;
        } | null;
      })
    : { track: null };

  const media = mediaJson.media ?? [];
  const mediaById = new Map(
    media.map((m) => [
      m.id,
      {
        r2Url: m.r2Url,
        originalName: m.originalName,
        type: m.type,
        localPath: m.localPath,
      },
    ])
  );
  const mediaByUrl = new Map<string, (typeof media)[number]>();
  for (const item of media) {
    mediaByUrl.set(item.r2Url, item);
    try {
      const parsed = new URL(item.r2Url);
      mediaByUrl.set(parsed.toString(), item);
      mediaByUrl.set(`${parsed.origin}${parsed.pathname}`, item);
    } catch {
      // Ignore malformed URLs and keep raw mapping.
    }
  }

  // Parse subtitle cues from JSON - handle both array and object formats
  let originalCues: SubtitleCue[] = [];
  if (subtitlesJson.track && subtitlesJson.track.cues) {
    try {
      originalCues = parseCuesJson(subtitlesJson.track.cues);
    } catch (error) {
      console.warn("Failed to parse subtitle cues:", error);
      originalCues = [];
    }
  }

  let subtitleCues = originalCues;
  let subtitleStyle: SubtitleStyle = subtitlesJson.track
    ? resolveSubtitleStyle(
        subtitlesJson.track.stylePreset || "instagram_reels",
        subtitlesJson.track.customStyle as SubtitleStyle | null
      )
    : resolveSubtitleStyle("instagram_reels", null);

  const doc = timelineJson.timeline ? parseTimelineRow(timelineJson.timeline) : null;
  if (doc) {
    // Check if voiceover changed or was regenerated
    const voiceoverClip = Object.values(doc.clips).find(
      (c) => c.id === "audio-voiceover" || (audio && c.audioAssetId === audio.id)
    );
    const voiceoverChanged = audio && (!voiceoverClip || voiceoverClip.audioAssetId !== audio.id);
    const subtitleTrackChanged = subtitlesJson.track && doc.settings?.subtitleTrackId !== subtitlesJson.track.id;

    if ((voiceoverChanged || subtitleTrackChanged) && originalCues.length > 0) {
      if (subtitlesJson.track) {
        doc.settings.subtitleTrackId = subtitlesJson.track.id;
      }
      // 1. Update/create the voiceover clip in the timeline document
      if (audio) {
        const audioClipId = voiceoverClip?.id || "audio-voiceover";
        doc.clips[audioClipId] = {
          id: audioClipId,
          trackId: "track-voiceover",
          audioAssetId: audio.id,
          type: "audio",
          startTime: 0,
          endTime: audio.durationMs,
          trimStart: 0,
          trimEnd: audio.durationMs,
          properties: {
            volume: 1,
            muted: false,
          },
        };
      }

      // 2. Remove all old subtitle clips and auto-generated fact clips from doc.clips
      for (const key of Object.keys(doc.clips)) {
        const clip = doc.clips[key];
        if (
          clip.trackId === "track-subtitle" ||
          clip.trackId === "track-facts" ||
          (clip.properties as any)?.textOverlayMeta?.category === "subtitle" ||
          (clip.properties as any)?.textOverlayMeta?.isAutoGenerated === true
        ) {
          delete doc.clips[key];
        }
      }

      // 3. Add new subtitle clips from originalCues
      originalCues.forEach((cue) => {
        const clipId = `subtitle-${cue.id}`;
        doc.clips[clipId] = {
          id: clipId,
          trackId: "track-subtitle",
          type: "text",
          startTime: cue.startMs,
          endTime: cue.endMs,
          trimStart: 0,
          trimEnd: cue.endMs - cue.startMs,
          properties: {
            text: wordWrap(cue.text, 35),
            cueId: cue.id,
            textOverlayMeta: { category: "subtitle" },
            position: { x: 0, y: 600 },
            size: { width: 920, height: 400 },
            rotation: 0,
            opacity: 1,
            fit: "none",
            style: {
              fontSize: (subtitleStyle.fontSize || 34) * 2,
              fontFamily: subtitleStyle.fontFamily || "Montserrat",
              fontStyle: subtitleStyle.fontStyle || "italic",
              fontWeight: subtitleStyle.fontWeight || 900,
              color: subtitleStyle.color || "#ffffff",
              "background.color": subtitleStyle.backgroundColor || "transparent",
              "transform.positionY": subtitleStyle.position === "bottom" ? 600 : subtitleStyle.position === "top" ? -600 : 0,
              stroke: subtitleStyle.stroke,
              strokeColor: subtitleStyle.strokeColor,
              strokeWidth: subtitleStyle.strokeWidth,
              shadow: subtitleStyle.shadow,
              borderColor: subtitleStyle.strokeColor,
              borderWidth: subtitleStyle.strokeWidth,
              boxShadow: subtitleStyle.shadow ? { x: 4, y: 4, blur: 0, color: "#000000" } : undefined,
              animation: subtitleStyle.animation,
              activeColor: subtitleStyle.highlightColor || "#f97316",
            },
          },
        };
      });

      // Check if custom titles exist; if so, skip auto-generating facts to preserve theme customizations
      const hasCustomTitles = Object.values(doc.clips).some(clip => (clip as any).properties?.textOverlayMeta?.category === "title" || clip.trackId === "track-text");

      // 4. Generate and add new fact overlay clips
      const facts = extractedFacts;
      if (facts && Array.isArray(facts) && !hasCustomTitles) {
        // Keep each fact pinned to its subtitle cue and run it until the next
        // fact starts (last one → end of video), so the title track covers the
        // video instead of flashing a few isolated cards out of sync.
        const sortedFacts = layoutFactTimings(facts as any[], {
          totalDurationMs:
            (audio?.durationMs ?? 0) ||
            originalCues[originalCues.length - 1]?.endMs,
        });

        sortedFacts.forEach((fact: any) => {
          const clipId = fact.id;
          doc.clips[clipId] = {
            id: clipId,
            trackId: "track-facts",
            type: "text",
            startTime: fact.startMs,
            endTime: fact.endMs,
            trimStart: 0,
            trimEnd: fact.endMs - fact.startMs,
            properties: {
              text: fact.text,
              textOverlayMeta: { category: fact.category, isAutoGenerated: true },
              position: { x: 80, y: 260 },
              size: { width: 920, height: 120 },
              rotation: 0,
              opacity: 1,
              fit: "cover",
              style: {
                fontFamily: "Montserrat, sans-serif",
                fontStyle: "italic",
                fontSize: 64,
                fontWeight: 900,
                color: "#f97316", // Orange theme
                backgroundColor: "transparent",
                borderColor: "#ffffff", // White outline
                borderWidth: 2,
                boxShadow: { x: 4, y: 4, blur: 0, color: "#000000" }, // Black shadow
                textTransform: "uppercase",
              },
            },
          };
        });
      }

      // 5. Re-sync track clip IDs
      syncTrackClipIds(doc);
      
      // Update subtitleCues to the new ones
      subtitleCues = originalCues;
    } else {
      // No voiceover change, get subtitles from timeline or use original cues
      const fromTimeline = getSubtitlesFromTimeline(doc, originalCues);
      subtitleCues = fromTimeline.cues.length > 0 ? fromTimeline.cues : originalCues;
      
      // Override timeline clips with the latest subtitleStyle from the database
      // so changes made in the Subtitle Studio correctly propagate to the editor.
      Object.values(doc.clips).forEach(clip => {
        if (clip.trackId === "track-subtitle" || (clip.properties as any)?.textOverlayMeta?.category === "subtitle") {
          const props = clip.properties as any;
          if (!props.style) props.style = {};
          props.style.fontSize = (subtitleStyle.fontSize || 34) * 2;
          props.style.fontFamily = subtitleStyle.fontFamily || "Montserrat";
          props.style.fontStyle = subtitleStyle.fontStyle || "italic";
          props.style.fontWeight = subtitleStyle.fontWeight || 900;
          props.style.color = subtitleStyle.color || "#ffffff";
          props.style["background.color"] = subtitleStyle.backgroundColor || "transparent";
          props.style["transform.positionY"] = subtitleStyle.position === "bottom" ? 600 : subtitleStyle.position === "top" ? -600 : 0;
          props.style.stroke = subtitleStyle.stroke;
          props.style.strokeColor = subtitleStyle.strokeColor;
          props.style.strokeWidth = subtitleStyle.strokeWidth;
          props.style.shadow = subtitleStyle.shadow;
          props.style.borderColor = subtitleStyle.strokeColor;
          props.style.borderWidth = subtitleStyle.strokeWidth;
          props.style.boxShadow = subtitleStyle.shadow ? { x: 4, y: 4, blur: 0, color: "#000000" } : undefined;
          props.style.animation = subtitleStyle.animation;
          props.style.activeColor = subtitleStyle.highlightColor || "#f97316";
        }
      });
    }
  }

  const subtitlePresetName = subtitlesJson.track?.stylePreset && subtitlesJson.track.stylePreset in SUBTITLE_STYLE_PRESETS
    ? subtitlesJson.track.stylePreset
    : "instagram_reels";

  if (subtitleCues.length === 0 && audio) {
    warnings.push("No subtitles found — export SRT from Subtitles tab first");
  }
  if (!audio) {
    warnings.push("No voiceover — generate in Voice tab");
  }
  if (media.length === 0) {
    warnings.push("No media uploaded — add photos or videos in Media tab");
  }

  let elements: ReturnType<typeof timelineDocumentToElements> = [];
  let durationMs = audio?.durationMs ?? 60_000;

  if (doc) {

    // Recover missing media/audio asset ids from saved URLs so older broken saves still hydrate.
    for (const clip of Object.values(doc.clips)) {
      const props = clip.properties as Record<string, unknown>;
      const style = (props.style as Record<string, unknown> | undefined) ?? undefined;
      const src =
        (style?.src as string | undefined) ??
        (props.src as string | undefined);

      if (!clip.mediaAssetId && src) {
        const mediaItem = mediaByUrl.get(src);
        if (mediaItem && (mediaItem.type === "IMAGE" || mediaItem.type === "VIDEO")) {
          clip.mediaAssetId = mediaItem.id;
        }
      }

      if (!clip.audioAssetId && src && audio && src === audio.r2Url) {
        clip.audioAssetId = audio.id;
      }
    }

    durationMs = doc.settings.durationMs;
    elements = timelineDocumentToElements(doc, {
      mediaById,
      audio: audio ?? null,
      subtitleCues: subtitleCues.map((c) => ({
        id: c.id,
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
        words: c.words,
      })),
    });
  } else {
    elements = buildDefaultElements(media, audio, subtitleCues, durationMs);
  }

  if (elements.length === 0) {
    elements = buildDefaultElements(media, audio, subtitleCues, durationMs);
  }

  const peaks =
    audio?.waveformData && Array.isArray(audio.waveformData)
      ? (audio.waveformData as number[])
      : null;
  elements = elements.map((el) =>
    el.type === "audio"
      ? { ...el, waveformPeaks: peaks }
      : el
  );

  durationMs = Math.max(
    durationMs,
    ...elements.map((e) => e.endMs),
    subtitleCues.length > 0 ? subtitleCues[subtitleCues.length - 1].endMs : 0
  );

  return {
    media,
    timeline: timelineJson.timeline
      ? parseTimelineRow(timelineJson.timeline)
      : null,
    timelineId: timelineJson.timeline?.id ?? null,
    subtitleCues: subtitleCues.map((c) => ({
      ...c,
      text: c.text.includes("\n") ? c.text : wordWrap(c.text, 35),
    })),
    subtitleStyle,
    subtitlePresetName,
    subtitleTrackId: subtitlesJson.track?.id ?? null,
    elements,
    durationMs,
    warnings,
  };
}

function buildDefaultElements(
  media: LoadedProjectAssets["media"],
  audio: ProjectAssetsInput["audio"],
  subtitleCues: ReturnType<typeof parseCuesJson>,
  durationMs: number
) {
  const elements: ReturnType<typeof timelineDocumentToElements> = [];

  if (audio) {
    elements.push({
      id: "audio-voiceover",
      type: "audio",
      trackIndex: 4,
      startMs: 0,
      endMs: audio.durationMs,
      audioAssetId: audio.id,
      mediaUrl: audio.r2Url,
      localPath: audio.localPath,
      mediaName: "Voiceover",
      visible: true,
      locked: false,
    });
  }

  // Do NOT auto-add media to the timeline - user should drag from library

  if (subtitleCues.length > 0) {
    elements.push({
      id: "sub-master",
      type: "subtitle",
      trackIndex: 3,
      startMs: subtitleCues[0].startMs,
      endMs: subtitleCues[subtitleCues.length - 1].endMs,
      text: subtitleCues.map((cue) => cue.text).join(" "),
      cueId: "master",
      visible: true,
      locked: false,
    });
  }

  return elements;
}

export { DEFAULT_EDITOR_TRACKS };
