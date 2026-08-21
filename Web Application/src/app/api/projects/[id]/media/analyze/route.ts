import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { analyzeMediaAsset } from "@/lib/media/analyze-media";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  mediaIds: z.array(z.string().min(1)).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user, project } = await requireProjectAccess(id);

    let mediaIds: string[] | undefined;
    try {
      const raw = await request.json();
      mediaIds = bodySchema.parse(raw).mediaIds;
    } catch {
      mediaIds = undefined;
    }

    const assets = await prisma.mediaAsset.findMany({
      where: {
        projectId: id,
        ...(mediaIds?.length ? { id: { in: mediaIds } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    if (assets.length === 0) {
      throw badRequest("No media files to analyze.");
    }

    const results = [];
    const errors: { mediaId: string; error: string }[] = [];

    for (const asset of assets) {
      try {
        const updated = await analyzeMediaAsset(asset, project.propertyData);
        results.push(updated);
      } catch (e) {
        errors.push({
          mediaId: asset.id,
          error: e instanceof Error ? e.message : "Analysis failed",
        });
      }
    }

    await trackEvent(user.id, "media_analyzed", {
      projectId: id,
      analyzed: results.length,
      failed: errors.length,
    });

    return NextResponse.json({
      analyzed: results,
      errors,
      total: assets.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
