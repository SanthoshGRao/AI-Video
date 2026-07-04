import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user, project: source } = await requireProjectAccess(id);

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        templateId: source.templateId,
        title: `${source.title} (Copy)`,
        propertyData: source.propertyData ?? undefined,
        extractedFacts: source.extractedFacts ?? undefined,
        targetAudience: source.targetAudience,
        language: source.language,
        tone: source.tone,
        ctaStyle: source.ctaStyle,
        durationSeconds: source.durationSeconds,
        status: "DRAFT",
      },
      include: {
        template: { select: { slug: true, name: true, icon: true } },
      },
    });

    await trackEvent(user.id, "project_duplicated", {
      sourceId: id,
      projectId: project.id,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
