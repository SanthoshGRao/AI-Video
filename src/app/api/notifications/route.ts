import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await prisma.analyticsEvent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const unreadCount = events.filter((e) => e.createdAt > oneDayAgo).length;

  return NextResponse.json({
    notifications: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
      read: e.createdAt <= oneDayAgo,
    })),
    unreadCount: Math.min(unreadCount, 9),
  });
}
