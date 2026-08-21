import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { unauthorized, handleRouteError } from "@/lib/api/errors";

export async function GET(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const { searchParams } = new URL(request.url);
    const parentFolderId = searchParams.get("parentFolderId");

    const folders = await prisma.mediaFolder.findMany({
      where: {
        userId: user.id,
        projectId: null,
        parentFolderId: parentFolderId || null,
      },
      include: { _count: { select: { mediaAssets: true, childFolders: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      folders: folders.map(({ _count, ...folder }) => ({
        ...folder,
        mediaCount: _count.mediaAssets,
        childFolderCount: _count.childFolders,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const body = await request.json();
    const { name, parentFolderId, description } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Folder name is required" },
        { status: 400 }
      );
    }

    const folder = await prisma.mediaFolder.create({
      data: {
        userId: user.id,
        projectId: null,
        name: name.trim(),
        description: description || null,
        parentFolderId: parentFolderId || null,
      },
    });

    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
