import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError, notFound, badRequest } from "@/lib/api/errors";
import { waveformPatchSchema } from "@/lib/validations/audio";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    await requireProjectAccess(id);

    const asset = await prisma.audioAsset.findFirst({
      where: { id: audioId, projectId: id },
    });
    if (!asset) throw notFound("Audio asset not found");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw badRequest("Invalid JSON body");
    }

    const parsed = waveformPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        parsed.error.issues.map((i) => i.message).join("; ") || "Invalid waveform"
      );
    }

    const updated = await prisma.audioAsset.update({
      where: { id: audioId },
      data: {
        waveformData: parsed.data.waveformData as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ audioAsset: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
