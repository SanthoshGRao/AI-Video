import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { DEFAULT_PROPERTY_TEMPLATES } from "@/lib/templates/defaults";

export async function GET() {
  let templates = await prisma.propertyTemplate.findMany({
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

  if (templates.length === 0) {
    // Auto-seed default templates
    for (const tpl of DEFAULT_PROPERTY_TEMPLATES) {
      await prisma.propertyTemplate.upsert({
        where: { slug: tpl.slug },
        update: tpl,
        create: tpl,
      }).catch(() => {});
    }
    templates = await prisma.propertyTemplate.findMany({
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
  }

  return NextResponse.json({ templates });
}
