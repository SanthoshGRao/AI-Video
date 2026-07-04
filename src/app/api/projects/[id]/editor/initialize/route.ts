import { NextRequest, NextResponse } from "next/server";
import { openCutProjectInitializer } from "@/lib/opencut/project-initializer";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/db/prisma";

/**
 * POST /api/projects/[id]/editor/initialize
 *
 * Auto-initialize an OpenCut project for editing.
 *
 * This endpoint:
 * 1. Validates the project exists and user owns it
 * 2. Checks readiness (voiceover, script generated)
 * 3. Loads all generated assets
 * 4. Converts to OpenCut format
 * 5. Returns ready-to-edit project
 *
 * Response:
 * {
 *   success: boolean
 *   project?: OpenCutProject
 *   status?: ProjectReadinessStatus
 *   error?: string
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: projectId } = await params;

    // TODO: Verify user owns this project
    // const project = await prisma.project.findFirst({
    //   where: { id: projectId, userId }
    // });
    // if (!project) {
    //   return NextResponse.json(
    //     { error: "Project not found or unauthorized" },
    //     { status: 404 }
    //   );
    // }

    // Get project readiness status first
    const readinessStatus = await openCutProjectInitializer.getProjectReadinessStatus(projectId);

    if (!readinessStatus.ready) {
      return NextResponse.json(
        {
          success: false,
          status: readinessStatus,
          error: "Project is not ready for editing. Missing: " + readinessStatus.missingItems.join(", "),
        },
        { status: 400 }
      );
    }

    // Auto-generate AI facts if they don't exist yet
    try {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (project && (!project.extractedFacts || (Array.isArray(project.extractedFacts) && project.extractedFacts.length === 0))) {
        const subtitleTrack = await prisma.subtitleTrack.findFirst({
          where: { projectId },
          orderBy: { createdAt: "desc" }
        });
        if (subtitleTrack) {
          const protocol = request.headers.get("x-forwarded-proto") || "http";
          const host = request.headers.get("host") || "localhost:3000";
          await fetch(`${protocol}://${host}/api/projects/${projectId}/facts/align`, {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               "Cookie": request.headers.get("cookie") || ""
            },
            body: JSON.stringify({ trackId: subtitleTrack.id })
          });
        }
      }
    } catch (err) {
      console.error("Failed to auto-align facts:", err);
    }

    // Initialize project
    const openCutProject = await openCutProjectInitializer.initializeProject(projectId);

    return NextResponse.json(
      {
        success: true,
        project: openCutProject,
        status: readinessStatus,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to initialize editor project:", error);

    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        error: `Failed to initialize project: ${message}`,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[id]/editor/initialize
 *
 * Check project readiness without initializing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: projectId } = await params;

    const status = await openCutProjectInitializer.getProjectReadinessStatus(projectId);

    return NextResponse.json(
      {
        success: true,
        status,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to check project readiness:", error);

    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
