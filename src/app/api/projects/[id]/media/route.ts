import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { deleteLegacyPublicFile } from "@/lib/storage/local";
import { serializeMediaAsset } from "@/lib/storage/serialize";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const media = await prisma.mediaAsset.findMany({
      where: { projectId: id },
      include: { mediaTags: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      media: media.map((m) => serializeMediaAsset(m)),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const clientMediaId = formData.get("clientMediaId") as string | null;
    const thumbnail = formData.get("thumbnail") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const { processMediaUpload } = await import("@/lib/media/process-upload");
    const mediaAsset = await processMediaUpload({
      userId: user.id,
      projectId: id,
      file,
      preferredId: clientMediaId,
      thumbnailFile: thumbnail
    });

    await prisma.project.update({
      where: { id },
      data: { status: "MEDIA_UPLOADED" },
    });

    await trackEvent(user.id, "media_uploaded", {
      projectId: id,
      mediaId: mediaAsset.id,
    });

    return NextResponse.json({ mediaAsset }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get("mediaId");
    if (!mediaId) {
      return NextResponse.json({ error: "mediaId required" }, { status: 400 });
    }

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, projectId: id },
    });
    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { deleteMediaFiles } = await import("@/lib/media/process-upload");
    deleteMediaFiles(asset);
    deleteLegacyPublicFile(asset.r2Url);

    await prisma.mediaAsset.delete({ where: { id: mediaId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    const body = await request.json();
    const { id: mediaId, name } = body;
    if (!mediaId || !name) {
      return NextResponse.json({ error: "Missing id or name" }, { status: 400 });
    }

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, projectId: id },
    });
    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.mediaAsset.update({
      where: { id: mediaId },
      data: { originalName: name },
    });

    return NextResponse.json({ success: true, media: serializeMediaAsset(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
