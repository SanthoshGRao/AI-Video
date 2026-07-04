import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { z } from "zod";

const brandKitSchema = z.object({
  companyName: z.string().max(200).optional().nullable(),
  primaryColor: z.string().max(20).optional(),
  secondaryColor: z.string().max(20).optional(),
  accentColor: z.string().max(20).optional(),
  fontFamily: z.string().max(100).optional(),
  phoneNumber: z.string().max(30).optional().nullable(),
  whatsappNumber: z.string().max(30).optional().nullable(),
  ctaFooter: z.string().max(500).optional().nullable(),
  website: z.string().max(200).optional().nullable(),
  logoUrl: z.string().max(500).optional().nullable(),
});

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let brandKit = await prisma.brandKit.findUnique({
    where: { userId: user.id },
  });

  if (!brandKit) {
    brandKit = await prisma.brandKit.create({
      data: { userId: user.id },
    });
  }

  return NextResponse.json({ brandKit });
}

export async function PATCH(request: Request) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = brandKitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const brandKit = await prisma.brandKit.upsert({
    where: { userId: user.id },
    update: parsed.data,
    create: { userId: user.id, ...parsed.data },
  });

  return NextResponse.json({ brandKit });
}
