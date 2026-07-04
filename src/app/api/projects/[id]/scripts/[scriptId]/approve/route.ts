import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess, requireScriptInProject } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = {
  params: Promise<{ id: string; scriptId: string }>;
};

/** Mark one script as approved for the production pipeline */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id, scriptId } = await context.params;
    const { user } = await requireProjectAccess(id);
    const script = await requireScriptInProject(scriptId, id, user.id);

    await prisma.$transaction([
      prisma.scriptVersion.updateMany({
        where: { projectId: id },
        data: { isApproved: false },
      }),
      prisma.scriptVersion.update({
        where: { id: scriptId },
        data: { isApproved: true, isActive: true },
      }),
    ]);

    await trackEvent(user.id, "script_approved", {
      projectId: id,
      scriptVersionId: scriptId,
      generationBatch: script.generationBatch,
    });

    const updated = await prisma.scriptVersion.findUnique({
      where: { id: scriptId },
    });

    return NextResponse.json({ script: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
