import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { unauthorized, handleRouteError } from "@/lib/api/errors";

export async function POST(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const body = await request.json();
    const { mediaIds, mediaFolderId } = body as {
      mediaIds?: unknown;
      mediaFolderId?: string | null;
    };

    if (!Array.isArray(mediaIds) || mediaIds.length === 0 || !mediaIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "mediaIds must be a non-empty array of strings" }, { status: 400 });
    }

    if (mediaFolderId) {
      const folder = await prisma.mediaFolder.findFirst({
        where: { id: mediaFolderId, userId: user.id, projectId: null },
      });
      if (!folder) {
        return NextResponse.json({ error: "Target folder not found" }, { status: 400 });
      }
    }

    const result = await prisma.mediaAsset.updateMany({
      where: { id: { in: mediaIds }, userId: user.id, projectId: null },
      data: { mediaFolderId: mediaFolderId || null },
    });

    return NextResponse.json({ success: true, movedCount: result.count });
  } catch (error) {
    return handleRouteError(error);
  }
}
