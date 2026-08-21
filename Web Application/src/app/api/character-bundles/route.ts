import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { characterBundleBodySchema } from "@/lib/validations/character-bundle";

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bundles = await prisma.characterBundle.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ bundles });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = characterBundleBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid character bundle data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, description, characters } = parsed.data;

  const bundle = await prisma.characterBundle.upsert({
    where: { userId_name: { userId: user.id, name } },
    update: { description, characters: characters as any },
    create: { userId: user.id, name, description, characters: characters as any },
  });

  return NextResponse.json({ bundle });
}
