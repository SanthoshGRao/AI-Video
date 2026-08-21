import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";

export async function trackEvent(
  userId: string,
  eventType: string,
  metadata?: Prisma.InputJsonValue
) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        userId,
        eventType,
        metadata: metadata ?? {},
      },
    });
  } catch (e) {
    console.warn("Analytics track failed:", e);
  }
}
