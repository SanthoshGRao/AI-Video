import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string; scriptId: string }> };

function estimateDurationSeconds(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 140) * 60));
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, scriptId } = await context.params;
    await requireProjectAccess(id);

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      throw badRequest("Script content is required");
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const script = await prisma.scriptVersion.update({
      where: { id: scriptId, projectId: id },
      data: {
        content,
        wordCount,
        estimatedDuration: estimateDurationSeconds(content),
        factCheckPassed: false,
        factCheckReport: undefined,
      },
    });

    await prisma.project.update({
      where: { id },
      data: { lastSavedAt: new Date() },
    });

    return NextResponse.json({ script });
  } catch (error) {
    return handleRouteError(error);
  }
}
