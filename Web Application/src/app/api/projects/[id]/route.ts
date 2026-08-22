import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { updateProjectSchema } from "@/lib/validations/project";
import { serializeProjectWithAssets } from "@/lib/storage/serialize-project";
import { accessibleProjectWhere } from "@/lib/workspace/access";

type RouteContext = { params: Promise<{ id: string }> };

/** Same access rule as requireProjectAccess: creator, or a member of the project's workspace. */
async function getAccessibleProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ...(await accessibleProjectWhere(userId)) },
    include: {
      template: true,
      scriptVersions: {
        orderBy: [{ generationBatch: "desc" }, { versionNumber: "asc" }],
      },
      contentPacks: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } },
      audioAssets: { orderBy: { createdAt: "desc" }, take: 1 },
      mediaAssets: { orderBy: { createdAt: "desc" }, take: 12 },
      subtitleTracks: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          scriptVersions: true,
          mediaAssets: true,
          exportJobs: true,
          audioAssets: true,
          contentPacks: true,
          subtitleTracks: true,
          timelines: true,
        },
      },
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);
    const project = await getAccessibleProject(id, user.id);

    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ project: serializeProjectWithAssets(project) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = updateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { propertyData, ...rest } = parsed.data;
    const updateData: Prisma.ProjectUpdateInput = {
      ...rest,
      lastSavedAt: new Date(),
      ...(propertyData !== undefined && {
        propertyData: propertyData as Prisma.InputJsonValue,
      }),
    };

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        template: { select: { slug: true, name: true, icon: true } },
      },
    });

    return NextResponse.json({ project });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);

    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
