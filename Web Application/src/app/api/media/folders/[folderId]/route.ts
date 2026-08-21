import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { unauthorized, handleRouteError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ folderId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const { folderId } = await context.params;

    const folder = await prisma.mediaFolder.findFirst({
      where: { id: folderId, userId: user.id, projectId: null },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    return NextResponse.json({ folder });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const { folderId } = await context.params;
    const body = await request.json();
    const { name, description } = body;

    const folder = await prisma.mediaFolder.findFirst({
      where: { id: folderId, userId: user.id, projectId: null },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const updated = await prisma.mediaFolder.update({
      where: { id: folderId },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description }),
      },
    });

    return NextResponse.json({ folder: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const { folderId } = await context.params;

    const folder = await prisma.mediaFolder.findFirst({
      where: { id: folderId, userId: user.id, projectId: null },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const mediaCount = await prisma.mediaAsset.count({
      where: { mediaFolderId: folderId },
    });

    if (mediaCount > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete folder with media inside",
          mediaCount,
        },
        { status: 409 }
      );
    }

    const childFolderCount = await prisma.mediaFolder.count({
      where: { parentFolderId: folderId },
    });

    if (childFolderCount > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete folder with sub-folders inside",
          childFolderCount,
        },
        { status: 409 }
      );
    }

    await prisma.mediaFolder.delete({ where: { id: folderId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
