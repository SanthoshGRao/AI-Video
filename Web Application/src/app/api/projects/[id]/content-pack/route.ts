import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest, notFound } from "@/lib/api/errors";
import { contentPackUpdateSchema } from "@/lib/content-pack/schema";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const pack = await prisma.contentPack.findFirst({
      where: { projectId: id, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!pack) {
      return NextResponse.json({ contentPack: null });
    }

    return NextResponse.json({ contentPack: pack });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    const pack = await prisma.contentPack.findFirst({
      where: { projectId: id, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!pack) {
      throw notFound("No active content pack. Generate one first.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw badRequest("Invalid JSON body");
    }

    const parsed = contentPackUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        parsed.error.issues.map((i) => i.message).join("; ") || "Invalid content pack"
      );
    }

    const data = parsed.data;
    const updated = await prisma.contentPack.update({
      where: { id: pack.id },
      data: {
        ...(data.instagramCaptions !== undefined && {
          instagramCaptions: data.instagramCaptions,
        }),
        ...(data.facebookCopies !== undefined && {
          facebookCopies: data.facebookCopies,
        }),
        ...(data.whatsappCopies !== undefined && {
          whatsappCopies: data.whatsappCopies,
        }),
        ...(data.youtubeDescriptions !== undefined && {
          youtubeDescriptions: data.youtubeDescriptions,
        }),
        ...(data.telegramCopy !== undefined && {
          telegramCopy: data.telegramCopy,
        }),
        ...(data.ctaVariations !== undefined && {
          ctaVariations: data.ctaVariations,
        }),
        ...(data.propertyHighlights !== undefined && {
          propertyHighlights: data.propertyHighlights,
        }),
        ...(data.googleBusinessPost !== undefined && {
          googleBusinessPost: data.googleBusinessPost,
        }),
        ...(data.hashtagSets !== undefined && {
          hashtagSets: data.hashtagSets as Prisma.InputJsonValue,
        }),
        ...(data.seoMetadata !== undefined && {
          seoMetadata: data.seoMetadata as Prisma.InputJsonValue,
        }),
        ...(data.selectedPlatforms !== undefined && {
          selectedPlatforms: data.selectedPlatforms,
        }),
      },
    });

    await trackEvent(user.id, "content_pack_updated", { projectId: id });

    return NextResponse.json({ contentPack: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
