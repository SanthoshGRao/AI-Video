import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { scopedProjectWhere } from "@/lib/workspace/access";

export async function GET(request: Request) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same sidebar scope the project list uses, so the dashboard counts match
  // the projects actually on screen.
  const scopeId = new URL(request.url).searchParams.get("workspaceId");
  const projectWhere = await scopedProjectWhere(user.id, scopeId);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalProjects, videosExported, exportsThisMonth, recentProjects] =
    await Promise.all([
      prisma.project.count({ where: projectWhere }),
      prisma.exportJob.count({
        where: {
          project: projectWhere,
          status: "DONE",
        },
      }),
      prisma.exportJob.count({
        where: {
          project: projectWhere,
          status: "DONE",
          completedAt: { gte: startOfMonth },
        },
      }),
      prisma.project.findMany({
        where: projectWhere,
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
