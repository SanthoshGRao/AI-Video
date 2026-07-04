import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, notFound, badRequest } from "@/lib/api/errors";
import { manualTagBodySchema } from "@/lib/media/tags-schema";
import { serializeMediaAsset } from "@/lib/storage/serialize";

type RouteContext = {
  params: Promise<{ id: string; mediaId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id, mediaId } = await context.params;
    await requireProjectAccess(id);

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, projectId: id },
    });
    if (!asset) throw notFound("Media not found");

    const body = manualTagBodySchema.parse(await request.json());
    const tag = body.tag
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    if (!tag) throw badRequest("Invalid tag");

    const existing = await prisma.mediaTag.findFirst({
      where: { mediaAssetId: mediaId, tag },
    });
    if (!existing) {
      await prisma.mediaTag.create({
        data: {
          mediaAssetId: mediaId,
          tag,
          confidence: 1,
          source: "manual",
        },
      });
    }

    const updated = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: mediaId },
      include: { mediaTags: { orderBy: { confidence: "desc" } } },
    });

    return NextResponse.json({ mediaAsset: serializeMediaAsset(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id, mediaId } = await context.params;
    await requireProjectAccess(id);

    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get("tagId");
    if (!tagId) throw badRequest("tagId required");

    const tag = await prisma.mediaTag.findFirst({
      where: { id: tagId, mediaAssetId: mediaId },
      include: { mediaAsset: true },
    });
    if (!tag || tag.mediaAsset.projectId !== id) {
      throw notFound("Tag not found");
    }

    await prisma.mediaTag.delete({ where: { id: tagId } });

    const updated = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: mediaId },
      include: { mediaTags: { orderBy: { confidence: "desc" } } },
    });

    return NextResponse.json({ mediaAsset: serializeMediaAsset(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
