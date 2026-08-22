import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { handleRouteError } from "@/lib/api/errors";

/** Join key shape: WS-A1B2-C3D4 — short enough to read aloud, wide enough (32 bits) not to be guessed. */
function generateWorkspaceKey(): string {
  const bytes = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `WS-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}`;
}

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: {
      workspace: {
        include: {
          members: {
            orderBy: { joinedAt: "asc" },
            include: {
              user: {
                select: { id: true, name: true, email: true, avatarUrl: true },
              },
            },
          },
          _count: { select: { projects: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    workspaceKey: m.workspace.workspaceKey,
    ownerId: m.workspace.ownerId,
    isOwner: m.workspace.ownerId === user.id,
    projectCount: m.workspace._count.projects,
    joinedAt: m.joinedAt,
    members: m.workspace.members.map((mem) => ({
      id: mem.user.id,
      name: mem.user.name,
      email: mem.user.email,
      avatarUrl: mem.user.avatarUrl,
      isOwner: mem.user.id === m.workspace.ownerId,
      joinedAt: mem.joinedAt,
    })),
  }));

  return NextResponse.json({ workspaces });
}

export async function POST(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      name?: string;
      workspaceKey?: string;
      workspaceId?: string;
    };
    const { action, name, workspaceKey, workspaceId } = body;

    // ---- Leave a workspace ------------------------------------------------
    if (action === "leave" || action === "exit") {
      if (!workspaceId) {
        return NextResponse.json(
          { error: "Workspace ID required to leave" },
          { status: 400 }
        );
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          members: { orderBy: { joinedAt: "asc" }, select: { userId: true } },
        },
      });
      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (!workspace.members.some((m) => m.userId === user.id)) {
        return NextResponse.json(
          { error: "You are not a member of this workspace" },
          { status: 403 }
        );
      }

      // The last person out turns off the lights. Projects filed here would
      // otherwise be orphaned — `Project.workspaceId` is SetNull on delete, so
      // they fall back to their creator's personal list rather than vanishing.
      if (workspace.members.length === 1) {
        await prisma.workspace.delete({ where: { id: workspaceId } });
        return NextResponse.json({
          message: `Left and closed '${workspace.name}'`,
          deleted: true,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.workspaceMember.deleteMany({
          where: { workspaceId, userId: user.id },
        });

        // Ownership is only ever a tiebreaker for who can rename or close the
        // workspace — everyone is an equal member otherwise. If the owner walks,
        // hand it to whoever joined earliest so the workspace stays manageable.
        if (workspace.ownerId === user.id) {
          const successor = workspace.members.find((m) => m.userId !== user.id);
          if (successor) {
            await tx.workspace.update({
              where: { id: workspaceId },
              data: { ownerId: successor.userId },
            });
          }
        }
      });

      return NextResponse.json({ message: `Left '${workspace.name}'` });
    }

    // ---- Join an existing workspace by key --------------------------------
    if (action === "join" || (workspaceKey && !name)) {
      const key = workspaceKey?.trim().toUpperCase();
      if (!key) {
        return NextResponse.json(
          { error: "Workspace join key is required" },
          { status: 400 }
        );
      }

      const target = await prisma.workspace.findUnique({
        where: { workspaceKey: key },
      });
      if (!target) {
        return NextResponse.json(
          { error: "Invalid workspace join key" },
          { status: 404 }
        );
      }

      const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: target.id, userId: user.id } },
      });
      if (existing) {
        return NextResponse.json({
          message: `You're already in '${target.name}'`,
          workspace: target,
        });
      }

      await prisma.workspaceMember.create({
        data: { workspaceId: target.id, userId: user.id, role: "MEMBER" },
      });

      return NextResponse.json({
        message: `Joined '${target.name}'`,
        workspace: target,
      });
    }

    // ---- Create a new workspace -------------------------------------------
    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Workspace name is required" },
        { status: 400 }
      );
    }

    // Retry on the astronomically unlikely key collision rather than 500-ing.
    let workspace = null;
    for (let attempt = 0; attempt < 5 && !workspace; attempt++) {
      try {
        workspace = await prisma.workspace.create({
          data: {
            name: name.trim(),
            workspaceKey: generateWorkspaceKey(),
            ownerId: user.id,
            members: { create: { userId: user.id, role: "OWNER" } },
          },
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, avatarUrl: true },
                },
              },
            },
          },
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== "P2002") throw e;
      }
    }

    if (!workspace) {
      return NextResponse.json(
        { error: "Could not allocate a workspace key, please try again" },
        { status: 500 }
      );
    }

    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
