import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { handleRouteError, unauthorized, notFound } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

/** Rename a workspace. Owner only — it's the one thing ownership still decides. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const workspace = await prisma.workspace.findUnique({ where: { id } });
    if (!workspace) throw notFound("Workspace not found");
    if (workspace.ownerId !== user.id) {
      return NextResponse.json(
        { error: "Only the workspace owner can rename it" },
        { status: 403 }
      );
    }

    const { name } = (await request.json().catch(() => ({}))) as { name?: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const updated = await prisma.workspace.update({
      where: { id },
      data: { name: name.trim() },
    });
    return NextResponse.json({ workspace: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Close a workspace, or remove one member from it.
 *
 * `?memberId=` removes that member; without it the whole workspace is deleted.
 * Both are owner-only. Projects filed in a deleted workspace are not destroyed —
 * `Project.workspaceId` is `onDelete: SetNull`, so each one reverts to its
 * creator's personal list.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const workspace = await prisma.workspace.findUnique({ where: { id } });
    if (!workspace) throw notFound("Workspace not found");
    if (workspace.ownerId !== user.id) {
      return NextResponse.json(
        { error: "Only the workspace owner can do that" },
        { status: 403 }
      );
    }

    const memberId = new URL(request.url).searchParams.get("memberId");

    if (memberId) {
      if (memberId === user.id) {
        return NextResponse.json(
          { error: "Use 'Leave workspace' to remove yourself" },
          { status: 400 }
        );
      }
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: id, userId: memberId },
      });
      return NextResponse.json({ message: "Member removed" });
    }

    await prisma.workspace.delete({ where: { id } });
    return NextResponse.json({ message: `Closed '${workspace.name}'` });
  } catch (error) {
    return handleRouteError(error);
  }
}
