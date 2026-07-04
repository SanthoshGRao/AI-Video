import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalProjects,
    totalScripts,
    totalExports,
    totalAudio,
    eventsByType,
    recentEvents,
    projectsByTemplate,
  ] = await Promise.all([
    prisma.project.count({ where: { userId: user.id } }),
    prisma.scriptVersion.count({
      where: { project: { userId: user.id } },
    }),
    prisma.exportJob.count({
      where: { project: { userId: user.id }, status: "DONE" },
    }),
    prisma.audioAsset.count({
      where: { project: { userId: user.id } },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["eventType"],
      where: { userId: user.id, createdAt: { gte: thirtyDaysAgo } },
      _count: true,
    }),
    prisma.analyticsEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.project.groupBy({
      by: ["templateId"],
      where: { userId: user.id },
      _count: true,
    }),
  ]);

  const templates = await prisma.propertyTemplate.findMany({
    select: { id: true, name: true, slug: true },
  });
  const templateMap = Object.fromEntries(templates.map((t) => [t.id, t.name]));

  return NextResponse.json({
    summary: {
      totalProjects,
      totalScripts,
      totalExports,
      totalVoiceovers: totalAudio,
      creditsUsed: user.creditsUsed,
      creditsLimit: user.creditsLimit,
    },
    eventsByType: eventsByType.map((e) => ({
      type: e.eventType,
      count: e._count,
    })),
    propertyTypes: projectsByTemplate.map((p) => ({
      type: p.templateId ? templateMap[p.templateId] ?? "Unknown" : "General",
      count: p._count,
    })),
    recentActivity: recentEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      createdAt: e.createdAt.toISOString(),
      metadata: e.metadata,
    })),
  });
}
