import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess, requireScriptInProject } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";

type RouteContext = {
  params: Promise<{ id: string; scriptId: string }>;
};

/** Set this script as the active selection for voiceover / social */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id, scriptId } = await context.params;
    const { user } = await requireProjectAccess(id);
    await requireScriptInProject(scriptId, id, user.id);

    await prisma.$transaction([
      prisma.scriptVersion.updateMany({
        where: { projectId: id },
        data: { isActive: false },
      }),
      prisma.scriptVersion.update({
        where: { id: scriptId },
        data: { isActive: true },
      }),
    ]);

    const script = await prisma.scriptVersion.findUnique({
      where: { id: scriptId },
    });

    return NextResponse.json({ script });
  } catch (error) {
    return handleRouteError(error);
  }
}
