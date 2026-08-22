import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { handleRouteError } from "@/lib/api/errors";
import { createProjectSchema } from "@/lib/validations/project";
import { ttsToProjectLanguage } from "@/lib/skit/project";
import { DEFAULT_PROPERTY_TEMPLATES } from "@/lib/templates/defaults";
import { resolveTargetWorkspaceId, scopedProjectWhere } from "@/lib/workspace/access";

export async function GET(request: Request) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `?workspaceId=` picks the sidebar scope: a workspace id shows that team's
  // projects, "personal" (or absent) shows the user's own unfiled ones.
  const scopeId = new URL(request.url).searchParams.get("workspaceId");

  const projects = await prisma.project.findMany({
    where: await scopedProjectWhere(user.id, scopeId),
    orderBy: { updatedAt: "desc" },
    include: {
      template: { select: { slug: true, name: true, icon: true } },
      // Whose work this is — the card shows a creator chip in shared workspaces
      // so a team can tell at a glance who made what.
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      // Card art candidates. Audio rows (DOCUMENT) can never supply a preview,
      // and the oldest asset is often exactly that — so filter to visual types
      // and float the ones that actually have a thumbnail to the front.
      mediaAssets: {
        where: { type: { in: ["VIDEO", "IMAGE"] } },
        orderBy: [
          { thumbnailUrl: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
        ],
        take: 4,
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
  try {
  // ---- Auth -------------------------------------------------------------
  let user;
  try {
    user = await getOrCreateDbUser();
  } catch (authErr) {
    console.error("[POST /api/projects] User lookup/creation failed:", authErr);
    return NextResponse.json(
      {
        error: "Failed to authenticate user",
        details: authErr instanceof Error ? authErr.message : String(authErr),
      },
      { status: 500 }
    );
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ---- Parse body -------------------------------------------------------
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
  const kind = data.kind ?? "standard";

  // New projects land in whichever workspace the sidebar has selected. An
  // unknown id, or one the user isn't a member of, degrades to personal rather
  // than failing the create.
  const workspaceId = await resolveTargetWorkspaceId(
    user.id,
    (body as { workspaceId?: string }).workspaceId
  );

  // ---- Skit / conversation projects -------------------------------------
  // No property template or fact extraction — the whole workflow (script,
  // cast, preview) lives in `propertyData.skit` so it needs no schema change.
  if (kind === "skit") {
    // Attach the generic template if it exists (purely to keep card art /
    // relations happy); it's optional on the model.
    let generic = await prisma.propertyTemplate.findUnique({ where: { slug: "general" } }).catch(() => null);
    if (!generic) {
      const genDef = DEFAULT_PROPERTY_TEMPLATES.find((t) => t.slug === "general") || DEFAULT_PROPERTY_TEMPLATES[0];
      generic = await prisma.propertyTemplate.upsert({ where: { slug: genDef.slug }, update: genDef, create: genDef }).catch(() => null);
    }
    const skitLanguage = data.skitLanguage ?? "kn-IN";

    let project;
    try {
      project = await prisma.project.create({
        data: {
          userId: user.id,
          workspaceId,
          templateId: generic?.id ?? null,
          title: data.title,
          propertyData: {
            kind: "skit",
            skit: {
              scriptText: data.skitScript ?? "",
              language: skitLanguage,
              cast: {},
            },
          },
          language: ttsToProjectLanguage(skitLanguage),
          tone: data.tone,
          ctaStyle: data.ctaStyle,
          durationSeconds: data.durationSeconds,
          status: "DRAFT",
        },
        include: {
          template: { select: { slug: true, name: true, icon: true } },
        },
      });
    } catch (dbErr) {
      console.error("[POST /api/projects] Skit project creation failed:", dbErr);
      return NextResponse.json(
        {
          error: "Failed to create skit project",
          details: dbErr instanceof Error ? dbErr.message : String(dbErr),
        },
        { status: 500 }
      );
    }

    // Analytics is best-effort — never let it fail project creation.
    await prisma.analyticsEvent
      .create({
        data: {
          userId: user.id,
          eventType: "project_created",
          metadata: { projectId: project.id, kind: "skit" },
        },
      })
      .catch(() => {});

    return NextResponse.json({ project }, { status: 201 });
  }

  // ---- Standard property-video projects ---------------------------------
  let template = await prisma.propertyTemplate.findUnique({
    where: { slug: data.templateSlug! },
  });

  if (!template) {
    const def =
      DEFAULT_PROPERTY_TEMPLATES.find((t) => t.slug === data.templateSlug) ||
      DEFAULT_PROPERTY_TEMPLATES.find((t) => t.slug === "general") ||
      DEFAULT_PROPERTY_TEMPLATES[0];

    try {
      template = await prisma.propertyTemplate.upsert({
        where: { slug: def.slug },
        update: def,
        create: def,
      });
    } catch (e) {
      console.error("[POST /api/projects] Failed to auto-create template:", e);
    }
  }

  if (!template) {
    return NextResponse.json(
      { error: `Unknown template: ${data.templateSlug}` },
      { status: 400 }
    );
  }

  let project;
  try {
    project = await prisma.project.create({
      data: {
        userId: user.id,
        workspaceId,
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
  } catch (dbErr) {
    console.error("[POST /api/projects] Project creation failed:", dbErr);
    return NextResponse.json(
      {
        error: "Failed to create project",
        details: dbErr instanceof Error ? dbErr.message : String(dbErr),
      },
      { status: 500 }
    );
  }

  await prisma.analyticsEvent
    .create({
      data: {
        userId: user.id,
        eventType: "project_created",
        metadata: { projectId: project.id, templateSlug: template.slug },
      },
    })
    .catch(() => {});

  return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    // Surfaces the real message (in `details`) instead of a bare 500 so the
    // desktop client can show what actually failed.
    console.error("[POST /api/projects] Unhandled error:", error);
    return handleRouteError(error);
  }
}
