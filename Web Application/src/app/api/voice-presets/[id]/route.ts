import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { voicePresetRenameBodySchema } from "@/lib/validations/voice-presets";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const preset = await prisma.voiceStylePreset.findUnique({ where: { id } });
  if (!preset || preset.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = voicePresetRenameBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid name", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.voiceStylePreset.update({
      where: { id },
      data: { name: parsed.data.name },
    });
    return NextResponse.json({ preset: updated });
  } catch {
    return NextResponse.json(
      { error: "You already have a preset with that name" },
      { status: 409 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const preset = await prisma.voiceStylePreset.findUnique({ where: { id } });
  if (!preset || preset.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.voiceStylePreset.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
