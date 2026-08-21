import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { DEFAULT_PROMPT_CHIPS } from "@/lib/templates/defaults";

export async function GET() {
  let chips = await prisma.promptChip.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  if (chips.length === 0) {
    for (const chip of DEFAULT_PROMPT_CHIPS) {
      await prisma.promptChip.upsert({
        where: { id: chip.id },
        update: chip,
        create: chip,
      }).catch(() => {});
    }
    chips = await prisma.promptChip.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  return NextResponse.json({ chips });
}
