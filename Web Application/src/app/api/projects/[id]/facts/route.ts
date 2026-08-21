import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { factSchema } from "@/lib/ai/extract-facts";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { updateFactsBodySchema } from "@/lib/validations/facts";
import {
  canConfirmFacts,
  canGenerateScripts,
  createEnvelopeFromExtracted,
  getValidationBlockers,
  parseEnvelope,
} from "@/lib/facts/envelope";
import { computeAllFieldFlags } from "@/lib/facts/verify-source";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

function getRawText(propertyData: unknown): string {
  const pd = propertyData as { rawText?: string } | null;
  return pd?.rawText?.trim() ?? "";
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { project } = await requireProjectAccess(id);

    const rawText = getRawText(project.propertyData);
    const extracted = project.extractedFacts
      ? factSchema.parse(project.extractedFacts)
      : null;

    let envelope = parseEnvelope(project.validatedFacts);
    if (!envelope && extracted && rawText) {
      envelope = createEnvelopeFromExtracted(extracted, rawText);
    } else if (envelope && rawText) {
      envelope = {
        ...envelope,
        flags: computeAllFieldFlags(envelope.data, rawText),
      };
    }

    return NextResponse.json({
      extracted,
      envelope,
      rawTextLength: rawText.length,
      canGenerateScripts: canGenerateScripts(envelope, !!extracted),
      blockers: envelope ? getValidationBlockers(envelope) : [],
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user, project } = await requireProjectAccess(id);

    const rawText = getRawText(project.propertyData);
    if (!rawText) {
      throw badRequest("Add property details before validating facts.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw badRequest("Invalid JSON body");
    }

    const parsed = updateFactsBodySchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        parsed.error.issues.map((i) => i.message).join("; ") || "Invalid facts"
      );
    }

    const { data, fieldStatus, confirm } = parsed.data;
    const flags = computeAllFieldFlags(data, rawText);

    let envelope = {
      version: 1 as const,
      data,
      fieldStatus,
      flags,
      approvedAt: parseEnvelope(project.validatedFacts)?.approvedAt ?? null,
    };

    if (confirm) {
      if (!canConfirmFacts(envelope)) {
        throw badRequest(
          `Cannot confirm yet: ${getValidationBlockers(envelope).join("; ")}`
        );
      }
      envelope = {
        ...envelope,
        approvedAt: new Date().toISOString(),
      };
    } else {
      envelope = { ...envelope, approvedAt: null };
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        validatedFacts: envelope as unknown as Prisma.InputJsonValue,
      },
    });

    if (confirm) {
      await trackEvent(user.id, "facts_validated", { projectId: id });
    }

    return NextResponse.json({
      envelope,
      canGenerateScripts: canGenerateScripts(envelope, true),
      blockers: getValidationBlockers(envelope),
      project: updated,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
