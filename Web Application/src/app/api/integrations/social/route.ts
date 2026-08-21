import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { SOCIAL_PLATFORMS } from "@/lib/social/platforms";

export const dynamic = "force-dynamic";

const connectSchema = z.object({
  platform: z.enum(["instagram", "facebook", "whatsapp", "youtube", "telegram"]),
  accountName: z.string().min(1).max(120).optional(),
});

export async function GET() {
  try {
    const user = await getOrCreateDbUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accounts = await prisma.connectedSocialAccount.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        platform: true,
        accountName: true,
        expiresAt: true,
        updatedAt: true,
      },
      orderBy: { platform: "asc" },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = connectSchema.parse(await request.json());
    const meta = SOCIAL_PLATFORMS.find((p) => p.id === body.platform);
    if (!meta) return handleRouteError(badRequest("Unknown platform"));

    const account = await prisma.connectedSocialAccount.upsert({
      where: {
        userId_platform: { userId: user.id, platform: meta.dbPlatform },
      },
      create: {
        userId: user.id,
        platform: meta.dbPlatform,
        accountName: body.accountName ?? meta.label,
        metadata: { connectedVia: "manual", connectedAt: new Date().toISOString() },
      },
      update: {
        accountName: body.accountName ?? meta.label,
        metadata: { connectedVia: "manual", connectedAt: new Date().toISOString() },
      },
      select: {
        id: true,
        platform: true,
        accountName: true,
        expiresAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ account });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const platform = new URL(request.url).searchParams.get("platform");
    const parsed = connectSchema.shape.platform.safeParse(platform);
    if (!parsed.success) return handleRouteError(badRequest("platform query required"));

    const meta = SOCIAL_PLATFORMS.find((p) => p.id === parsed.data);
    if (!meta) return handleRouteError(badRequest("Unknown platform"));

    await prisma.connectedSocialAccount.deleteMany({
      where: { userId: user.id, platform: meta.dbPlatform },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
