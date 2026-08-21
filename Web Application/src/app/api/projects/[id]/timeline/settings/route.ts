import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { DEFAULT_TIMELINE_SETTINGS } from "@/lib/timeline/defaults";

type RouteContext = { params: Promise<{ id: string }> };

const PRESETS = [
  { width: 1920, height: 1080, aspectRatio: "16:9" },
  { width: 1080, height: 1920, aspectRatio: "9:16" },
  { width: 1080, height: 1080, aspectRatio: "1:1" },
  { width: 1440, height: 1080, aspectRatio: "4:3" },
] as const;

function findPreset(width: number, height: number) {
  return PRESETS.find((preset) => preset.width === width && preset.height === height);
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const timeline = await prisma.timeline.findFirst({
      where: { projectId: id },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ],
      select: { settings: true },
    });

    return NextResponse.json({
      settings: timeline?.settings ?? DEFAULT_TIMELINE_SETTINGS,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const body = await request.json();
    const width = Number(body.width);
    const height = Number(body.height);
    const preset = findPreset(width, height);
    if (!preset) {
      throw badRequest("Unsupported canvas size");
    }

    const latest = await prisma.timeline.findFirst({
      where: { projectId: id },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ],
    });

    const currentSettings =
      latest?.settings && typeof latest.settings === "object"
        ? (latest.settings as Record<string, unknown>)
        : DEFAULT_TIMELINE_SETTINGS;
    const settings = {
      ...currentSettings,
      width: preset.width,
      height: preset.height,
      aspectRatio: preset.aspectRatio,
    };

    const timeline = latest
      ? await prisma.timeline.update({
          where: { id: latest.id },
          data: { settings: settings as Prisma.InputJsonValue },
        })
      : await prisma.timeline.create({
          data: {
            projectId: id,
            version: 1,
            tracks: [] as unknown as Prisma.InputJsonValue,
            clips: {} as unknown as Prisma.InputJsonValue,
            transitions: [] as unknown as Prisma.InputJsonValue,
            textLayers: [] as unknown as Prisma.InputJsonValue,
            settings: settings as Prisma.InputJsonValue,
            isAutosave: false,
            isAiGenerated: false,
          },
        });

    await prisma.project.update({
      where: { id },
      data: { lastSavedAt: new Date() },
    });

    return NextResponse.json({ settings: timeline.settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
