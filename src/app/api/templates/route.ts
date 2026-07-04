import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  const templates = await prisma.propertyTemplate.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      icon: true,
      focusAreas: true,
      sortOrder: true,
    },
  });

  return NextResponse.json({ templates });
}
