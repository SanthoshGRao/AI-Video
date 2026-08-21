import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [events, unreadCount] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.analyticsEvent.count({
      where: { userId: user.id, read: false },
    }),
  ]);

  return NextResponse.json({
    notifications: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
      read: e.read,
    })),
    unreadCount: Math.min(unreadCount, 9),
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: unknown = body?.ids;

  await prisma.analyticsEvent.updateMany({
    where: {
      userId: user.id,
      read: false,
      ...(Array.isArray(ids) && ids.length > 0
        ? { id: { in: ids.filter((id): id is string => typeof id === "string") } }
        : {}),
    },
    data: { read: true },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count } = await prisma.analyticsEvent.deleteMany({
    where: { userId: user.id },
  });

  return NextResponse.json({ success: true, deleted: count });
}
