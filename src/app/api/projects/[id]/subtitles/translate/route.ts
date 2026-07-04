import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { defaultModel } from "@/lib/ai/client";
import { generateObject } from "ai";
import { z } from "zod";
import type { SubtitleCue } from "@/lib/subtitles/types";
import { parseCuesJson } from "@/lib/subtitles/cues";
import { Prisma } from "@/generated/prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const body = await request.json();
    const { trackId } = body;

    if (!trackId) {
      throw badRequest("trackId is required");
    }

    const track = await prisma.subtitleTrack.findUnique({
      where: { id: trackId, projectId: id },
    });

    if (!track) {
      throw badRequest("Subtitle track not found");
    }

    const originalCues = parseCuesJson(track.cues);
    if (originalCues.length === 0) {
      throw badRequest("No cues to translate");
    }

    // Prepare translation prompt
    const prompt = `You are a professional subtitle translator.
Translate the following subtitle cues from Kannada/Hinglish/Indian English to grammatically perfect, natural-sounding fluent English.
Keep the translations concise so they fit on screen easily.
Return the exact same IDs for each cue with their translated text.

Cues:
${originalCues.map((c) => `[${c.id}] ${c.text}`).join("\n")}`;

    const { object } = await generateObject({
      model: defaultModel,
      schema: z.object({
        translations: z.array(
          z.object({
            id: z.string(),
            text: z.string(),
          })
        ),
      }),
      prompt,
    });

    // Map translations back to cues
    const translatedCues: SubtitleCue[] = [];
    const translationMap = new Map(object.translations.map((t) => [t.id, t.text]));

    for (const cue of originalCues) {
      const translatedText = translationMap.get(cue.id) || cue.text;
      
      // Distribute word timings evenly across the new translated words
      const words = translatedText.split(/\s+/).filter(Boolean);
      const cueDuration = cue.endMs - cue.startMs;
      const msPerWord = words.length > 0 ? Math.floor(cueDuration / words.length) : cueDuration;
      
      const newWords = words.map((word, i) => {
        const startMs = cue.startMs + (i * msPerWord);
        const endMs = i === words.length - 1 ? cue.endMs : startMs + msPerWord;
        return {
          word,
          startMs,
          endMs,
        };
      });

      translatedCues.push({
        ...cue,
        text: translatedText,
        words: newWords,
      });
    }

    // Save as English track
    const existingEnglishTrack = await prisma.subtitleTrack.findFirst({
      where: { projectId: id, audioAssetId: track.audioAssetId, language: "english" },
    });

    let newTrack;
    if (existingEnglishTrack && existingEnglishTrack.id !== track.id) {
      newTrack = await prisma.subtitleTrack.update({
        where: { id: existingEnglishTrack.id },
        data: {
          cues: translatedCues as unknown as Prisma.InputJsonValue,
        }
      });
    } else {
      newTrack = await prisma.subtitleTrack.create({
        data: {
          projectId: id,
          audioAssetId: track.audioAssetId,
          cues: translatedCues as unknown as Prisma.InputJsonValue,
          stylePreset: track.stylePreset,
          customStyle: track.customStyle || Prisma.JsonNull,
          isBurntIn: track.isBurntIn,
          language: "english",
        },
      });
      // Fix the original track if it was incorrectly labeled as english
      if (track.language === "english") {
        await prisma.subtitleTrack.update({
          where: { id: track.id },
          data: { language: "kannada_english" }
        });
      }
    }

    const timeline = await prisma.timeline.findFirst({
      where: { projectId: id },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ],
    });

    if (timeline) {
      const settings = timeline.settings && typeof timeline.settings === "object" 
        ? { ...(timeline.settings as Record<string, any>) } 
        : {};
      settings.subtitleTrackId = newTrack.id;
      await prisma.timeline.update({
        where: { id: timeline.id },
        data: { settings: settings as Prisma.InputJsonValue },
      });
    }

    return NextResponse.json({
      success: true,
      track: {
        ...newTrack,
        cues: parseCuesJson(newTrack.cues),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
