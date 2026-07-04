import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { createProjectSchema } from "@/lib/validations/project";

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      template: { select: { slug: true, name: true, icon: true } },
      mediaAssets: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          type: true,
          r2Url: true,
          thumbnailUrl: true,
        },
      },
      _count: {
        select: {
          scriptVersions: true,
          exportJobs: true,
          mediaAssets: true,
          contentPacks: true,
          audioAssets: true,
        },
      },
    },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const template = await prisma.propertyTemplate.findUnique({
    where: { slug: data.templateSlug },
  });

  if (!template) {
    return NextResponse.json(
      { error: `Unknown template: ${data.templateSlug}` },
      { status: 400 }
    );
  }

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      templateId: template.id,
      title: data.title,
      propertyData: {
        rawText: data.propertyDetails,
        enteredAt: new Date().toISOString(),
      },
      targetAudience: data.targetAudience ?? null,
      language: data.language,
      tone: data.tone,
      ctaStyle: data.ctaStyle,
      durationSeconds: data.durationSeconds,
      status: "DRAFT",
    },
    include: {
      template: { select: { slug: true, name: true, icon: true } },
    },
  });

  await prisma.analyticsEvent.create({
    data: {
      userId: user.id,
      eventType: "project_created",
      metadata: { projectId: project.id, templateSlug: template.slug },
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}
