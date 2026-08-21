import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, notFound } from "@/lib/api/errors";
import { analyzeMediaAsset } from "@/lib/media/analyze-media";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = {
  params: Promise<{ id: string; mediaId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id, mediaId } = await context.params;
    const { user, project } = await requireProjectAccess(id);

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, projectId: id },
    });
    if (!asset) throw notFound("Media not found");

    const updated = await analyzeMediaAsset(asset, project.propertyData);

    await trackEvent(user.id, "media_analyzed", {
      projectId: id,
      mediaId,
      single: true,
    });

    return NextResponse.json({ mediaAsset: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
