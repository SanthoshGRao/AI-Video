import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { unauthorized } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/errors";
import { serializeMediaAsset } from "@/lib/storage/serialize";

export async function GET(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");
    const searchQuery = searchParams.get("q");
    const scope = searchParams.get("scope");

    const where: any = { userId: user.id, projectId: null };

    if (folderId) {
      where.mediaFolderId = folderId;
    } else if (scope !== "all") {
      // Default (and explicit `?folderId=`) scopes to root-level media.
      // Pass `?scope=all` to fetch every asset regardless of folder.
      where.mediaFolderId = null;
    }

    if (searchQuery) {
      where.originalName = { contains: searchQuery, mode: "insensitive" };
    }

    const media = await prisma.mediaAsset.findMany({
      where,
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

export async function DELETE(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get("mediaId");
    if (!mediaId) {
      return NextResponse.json({ error: "mediaId required" }, { status: 400 });
    }

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, userId: user.id },
    });
    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { deleteMediaFiles } = await import("@/lib/media/process-upload");
    deleteMediaFiles(asset);

    const { deleteLegacyPublicFile } = await import("@/lib/storage/local");
    deleteLegacyPublicFile(asset.r2Url);

    await prisma.mediaAsset.delete({ where: { id: mediaId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const body = await request.json();
    const { id, name, mediaFolderId } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const asset = await prisma.mediaAsset.findFirst({
      where: { id, userId: user.id },
    });
    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.mediaAsset.update({
      where: { id },
      data: {
        ...(name && { originalName: name }),
        ...(mediaFolderId !== undefined && { mediaFolderId: mediaFolderId || null }),
      },
    });

    return NextResponse.json({ success: true, media: serializeMediaAsset(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
