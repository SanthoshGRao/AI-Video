import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  const chips = await prisma.promptChip.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ chips });
}
