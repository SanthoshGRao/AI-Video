import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import type { SubtitleStyle } from "@/lib/subtitles/types";
import { parseCuesJson } from "@/lib/subtitles/cues";

type RouteContext = { params: Promise<{ id: string }> };

function normalizeSubtitleStyle(style: unknown): Prisma.InputJsonValue | undefined {
  if (!style || typeof style !== "object") return style as Prisma.InputJsonValue | undefined;
  return { ...(style as SubtitleStyle), position: "bottom" } as unknown as Prisma.InputJsonValue;
}

function subtitleStyleToTimelineStyle(style: SubtitleStyle) {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    color: style.color,
    backgroundColor: style.backgroundColor,
    "background.color": style.backgroundColor,
    "transform.positionY": 600,
    animation: style.animation,
    highlightColor: style.highlightColor,
    stroke: style.stroke,
    "stroke.enabled": style.stroke,
    strokeColor: style.strokeColor,
    "stroke.color": style.strokeColor,
    strokeWidth: style.strokeWidth,
    "stroke.width": style.strokeWidth,
    shadow: style.shadow,
  };
}

/**
 * GET /api/projects/[id]/subtitles
 * 
 * Retrieve the latest subtitle track for a project
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const url = new URL(request.url);
    const requestedTrackId = url.searchParams.get("trackId");
    const audioAssetId = url.searchParams.get("audioAssetId");

    const whereClause: { projectId: string; audioAssetId?: string } = { projectId: id };
    if (audioAssetId) {
      whereClause.audioAssetId = audioAssetId;
    }

    const tracks = await prisma.subtitleTrack.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
    });

    const timeline = await prisma.timeline.findFirst({
      where: { projectId: id },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ],
    });

    let track = null;
    if (requestedTrackId) {
      track = tracks.find(t => t.id === requestedTrackId) || null;
      
      // Make the requested track sticky by saving it to timeline settings
      if (track && timeline) {
        const settings = timeline.settings && typeof timeline.settings === "object" 
          ? { ...(timeline.settings as Record<string, any>) } 
          : {};
        
        if (settings.subtitleTrackId !== track.id) {
          settings.subtitleTrackId = track.id;
          await prisma.timeline.update({
            where: { id: timeline.id },
            data: { settings: settings as Prisma.InputJsonValue },
          });
        }
      }
    }
    
    if (!track && timeline?.settings && typeof timeline.settings === "object") {
      const activeId = (timeline.settings as Record<string, any>).subtitleTrackId;
      if (activeId && activeId !== "force-rebuild") {
        track = tracks.find(t => t.id === activeId) || null;
      }
    }

    if (!track) {
      track = tracks[0] || null;
    }

    return NextResponse.json({
      success: true,
      track: track
        ? {
            id: track.id,
            projectId: track.projectId,
            audioAssetId: track.audioAssetId,
            language: track.language,
            cues: parseCuesJson(track.cues),
            stylePreset: track.stylePreset,
            customStyle: normalizeSubtitleStyle(track.customStyle),
            isBurntIn: track.isBurntIn,
          }
        : null,
      tracks: tracks.map(t => ({
        id: t.id,
        language: t.language,
        stylePreset: t.stylePreset,
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PUT /api/projects/[id]/subtitles
 * 
 * Update subtitle track properties (stylePreset, customStyle)
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const body = await request.json();
    const { trackId, stylePreset, customStyle, cues } = body;

    if (!trackId) {
      throw badRequest("trackId is required");
    }

    const track = await prisma.subtitleTrack.update({
      where: { id: trackId, projectId: id },
      data: {
        stylePreset: stylePreset !== undefined ? stylePreset : undefined,
        customStyle: customStyle !== undefined ? normalizeSubtitleStyle(customStyle) : undefined,
        cues: Array.isArray(cues) ? (cues as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    if (customStyle !== undefined && customStyle) {
      const normalizedStyle = normalizeSubtitleStyle(customStyle) as unknown as SubtitleStyle;
      const timeline = await prisma.timeline.findFirst({
        where: { projectId: id },
        orderBy: [
          { version: "desc" },
          { createdAt: "desc" }
        ],
      });
      if (timeline?.clips && typeof timeline.clips === "object") {
        const clips = { ...(timeline.clips as Record<string, any>) };
        let changed = false;
        for (const clip of Object.values(clips)) {
          if (clip?.trackId === "track-subtitle" || clip?.properties?.textOverlayMeta?.category === "subtitle") {
            clip.properties = {
              ...(clip.properties ?? {}),
              style: {
                ...(clip.properties?.style ?? {}),
                ...subtitleStyleToTimelineStyle(normalizedStyle),
              },
            };
            changed = true;
          }
        }
        if (changed) {
          await prisma.timeline.update({
            where: { id: timeline.id },
            data: { clips: clips as Prisma.InputJsonValue },
          });
        }
      }
    }

    if (cues !== undefined && Array.isArray(cues)) {
      const timeline = await prisma.timeline.findFirst({
        where: { projectId: id },
        orderBy: [
          { version: "desc" },
          { createdAt: "desc" }
        ],
      });
      if (timeline?.settings && typeof timeline.settings === "object") {
        const settings = { ...(timeline.settings as Record<string, any>) };
        settings.subtitleTrackId = "force-rebuild";
        await prisma.timeline.update({
          where: { id: timeline.id },
          data: { settings: settings as Prisma.InputJsonValue },
        });
      }
    }

    return NextResponse.json({
      success: true,
      track: {
        id: track.id,
        stylePreset: track.stylePreset,
        customStyle: track.customStyle,
        cues: track.cues,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
