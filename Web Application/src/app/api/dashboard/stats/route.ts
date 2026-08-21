import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalProjects, videosExported, exportsThisMonth, recentProjects] =
    await Promise.all([
      prisma.project.count({ where: { userId: user.id } }),
      prisma.exportJob.count({
        where: {
          project: { userId: user.id },
          status: "DONE",
        },
      }),
      prisma.exportJob.count({
        where: {
          project: { userId: user.id },
          status: "DONE",
          completedAt: { gte: startOfMonth },
        },
      }),
      prisma.project.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          template: { select: { name: true, slug: true } },
          _count: { select: { scriptVersions: true, exportJobs: true } },
          mediaAssets: {
            take: 1,
            orderBy: { createdAt: "desc" },
            where: { type: "IMAGE" },
            select: { id: true, r2Url: true, thumbnailUrl: true, type: true },
          },
        },
      }),
    ]);

  const recentActivity = await prisma.analyticsEvent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return NextResponse.json({
    stats: {
      totalProjects,
      videosExported,
      exportsThisMonth,
      creditsUsed: user.creditsUsed,
      creditsLimit: user.creditsLimit,
    },
    recentProjects,
    recentActivity,
  });
}
