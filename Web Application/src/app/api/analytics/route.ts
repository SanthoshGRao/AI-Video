import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";

/** Local YYYY-MM-DD key so buckets align with the user's calendar day. */
function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [
    totalProjects,
    totalScripts,
    totalAudio,
    eventsByType,
    recentEvents,
    projectsByTemplate,
    eventsInRange,
    doneExports,
    failedExports,
    mediaAgg,
  ] = await Promise.all([
    prisma.project.count({ where: { userId: user.id } }),
    prisma.scriptVersion.count({
      where: { project: { userId: user.id } },
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
    prisma.analyticsEvent.findMany({
      where: { userId: user.id, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.exportJob.findMany({
      where: { project: { userId: user.id }, status: "DONE" },
      select: { startedAt: true, completedAt: true, fileSizeBytes: true },
    }),
    prisma.exportJob.count({
      where: { project: { userId: user.id }, status: "FAILED" },
    }),
    prisma.mediaAsset.aggregate({
      where: {
        OR: [{ userId: user.id }, { project: { userId: user.id } }],
      },
      _sum: { fileSizeBytes: true },
      _count: true,
    }),
  ]);

  // Zero-filled 30-day activity series
  const buckets = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    buckets.set(dayKey(d), 0);
  }
  for (const e of eventsInRange) {
    const key = dayKey(e.createdAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const dailyActivity = [...buckets.entries()].map(([date, count]) => ({
    date,
    count,
  }));

  // Export performance
  const renderDurations = doneExports
    .filter((j) => j.startedAt && j.completedAt)
    .map((j) => (j.completedAt!.getTime() - j.startedAt!.getTime()) / 1000);
  const avgRenderSeconds = renderDurations.length
    ? Math.round(
        renderDurations.reduce((a, b) => a + b, 0) / renderDurations.length
      )
    : null;
  const totalOutputBytes = doneExports.reduce(
    (sum, j) => sum + (j.fileSizeBytes ?? 0),
    0
  );

  const templates = await prisma.propertyTemplate.findMany({
    select: { id: true, name: true, slug: true },
  });
  const templateMap = Object.fromEntries(templates.map((t) => [t.id, t.name]));

  return NextResponse.json({
    summary: {
      totalProjects,
      totalScripts,
      totalExports: doneExports.length,
      totalVoiceovers: totalAudio,
      creditsUsed: user.creditsUsed,
      creditsLimit: user.creditsLimit,
    },
    dailyActivity,
    exportStats: {
      done: doneExports.length,
      failed: failedExports,
      successRate:
        doneExports.length + failedExports > 0
          ? Math.round(
              (doneExports.length / (doneExports.length + failedExports)) * 100
            )
          : null,
      avgRenderSeconds,
      totalOutputBytes,
    },
    library: {
      mediaCount: mediaAgg._count,
      storageBytes: mediaAgg._sum.fileSizeBytes ?? 0,
    },
    eventsByType: eventsByType
      .map((e) => ({ type: e.eventType, count: e._count }))
      .sort((a, b) => b.count - a.count),
    propertyTypes: projectsByTemplate
      .map((p) => ({
        type: p.templateId ? templateMap[p.templateId] ?? "Unknown" : "General",
        count: p._count,
      }))
      .sort((a, b) => b.count - a.count),
    recentActivity: recentEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      createdAt: e.createdAt.toISOString(),
      metadata: e.metadata,
    })),
  });
}
