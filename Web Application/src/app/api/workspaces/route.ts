import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import crypto from "crypto";

function generateKey(prefix: string): string {
  const bytes = crypto.randomBytes(4).toString("hex").toUpperCase();
  const part1 = bytes.slice(0, 4);
  const part2 = bytes.slice(4, 8);
  return `${prefix}-${part1}-${part2}-2026`;
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
            include: {
              user: {
                select: { id: true, name: true, email: true, avatarUrl: true },
              },
            },
          },
          _count: {
            select: { projects: true },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    workspaceKey: m.workspace.workspaceKey,
    role: m.role,
    projectCount: m.workspace._count.projects,
    members: m.workspace.members.map((mem) => ({
      id: mem.user.id,
      name: mem.user.name,
      email: mem.user.email,
      avatarUrl: mem.user.avatarUrl,
      role: mem.role,
    })),
  }));

  return NextResponse.json({ workspaces });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    // Action 0: Leave / Exit team workspace
    if (action === "leave" || action === "exit") {
      const { workspaceId } = body;
      if (!workspaceId) {
        return NextResponse.json({ error: "Workspace ID required to leave" }, { status: 400 });
      }

      await prisma.workspaceMember.deleteMany({
        where: {
          workspaceId,
          userId: user.id,
        },
      });

      return NextResponse.json({ message: "Successfully left workspace" });
    }

    // Action 1: Join existing team workspace via Join Key
    if (action === "join" || (workspaceKey && !name)) {
      const key = workspaceKey.trim().toUpperCase();
      const targetWorkspace = await prisma.workspace.findUnique({
        where: { workspaceKey: key },
      });

      if (!targetWorkspace) {
        return NextResponse.json({ error: "Invalid Workspace Join Key" }, { status: 404 });
      }

      // Check if already a member
      const existingMember = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: targetWorkspace.id,
            userId: user.id,
          },
        },
      });

      if (existingMember) {
        return NextResponse.json({ message: "You are already a member of this workspace", workspace: targetWorkspace });
      }

      const membership = await prisma.workspaceMember.create({
        data: {
          workspaceId: targetWorkspace.id,
          userId: user.id,
          role: "MEMBER",
        },
        include: { workspace: true },
      });

      return NextResponse.json({
        message: `Successfully joined '${targetWorkspace.name}'`,
        workspace: membership.workspace,
      }, { status: 200 });
    }

    // Action 2: Create a new Team Workspace
    if (!name?.trim()) {
      return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
    }

    const newKey = generateKey("WS");
    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        workspaceKey: newKey,
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });

    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/workspaces] Failed:", error);
    return NextResponse.json(
      { error: "Failed to process workspace request", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
