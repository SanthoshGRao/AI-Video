import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { recordFontUsageSchema } from "@/lib/validations/fonts";

const FAVORITES_LIMIT = 12;

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usages = await prisma.fontUsage.findMany({
    where: { userId: user.id },
    orderBy: [{ count: "desc" }, { lastUsedAt: "desc" }],
    take: FAVORITES_LIMIT,
  });

  return NextResponse.json({ favorites: usages.map((u) => u.family) });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = recordFontUsageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid font family" }, { status: 400 });
  }

  const { family } = parsed.data;

  await prisma.fontUsage.upsert({
    where: { userId_family: { userId: user.id, family } },
    update: { count: { increment: 1 }, lastUsedAt: new Date() },
    create: { userId: user.id, family },
  });

  return NextResponse.json({ success: true });
}
