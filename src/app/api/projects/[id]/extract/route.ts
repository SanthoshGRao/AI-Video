import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { extractFactsFromText } from "@/lib/ai/extract-facts";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user, project } = await requireProjectAccess(id);

    const propertyData = project.propertyData as { rawText?: string } | null;
    const rawText = propertyData?.rawText;

    if (!rawText) {
      throw badRequest("No raw property text found to extract facts from.");
    }

    const template = project.templateId
      ? await prisma.propertyTemplate.findUnique({
          where: { id: project.templateId },
        })
      : null;

    const object = await extractFactsFromText(
      rawText,
      template?.aiSystemPrompt
    );

    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        extractedFacts: object,
        validatedFacts: Prisma.DbNull,
        status: "CONTENT_READY",
      },
    });

    await trackEvent(user.id, "facts_extracted", { projectId: id });

    return NextResponse.json({ facts: object, project: updatedProject });
  } catch (error) {
    return handleRouteError(error);
  }
}
