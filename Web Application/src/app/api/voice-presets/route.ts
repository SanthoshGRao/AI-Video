import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { voicePresetBodySchema } from "@/lib/validations/voice-presets";

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const presets = await prisma.voiceStylePreset.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ presets });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = voicePresetBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid preset", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, geminiVoice, languageCode, styleId, styleInstructions } = parsed.data;

  const preset = await prisma.voiceStylePreset.upsert({
    where: { userId_name: { userId: user.id, name } },
    update: { geminiVoice, languageCode, styleId, styleInstructions },
    create: { userId: user.id, name, geminiVoice, languageCode, styleId, styleInstructions },
  });

  return NextResponse.json({ preset });
}
