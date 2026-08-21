import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { getEditorBootstrap } from "@/lib/editor-v2/bootstrap";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/editor-bootstrap
 *
 * The exact payload the standalone /editor/[project_id] page loads with —
 * saved timeline, title cards, captions, subtitle style, and project media
 * including global-library assets referenced by the timeline's clips.
 *
 * Content Studio's embedded editor tab must load through this same bootstrap:
 * it previously rebuilt the payload itself from project-scoped endpoints, so
 * a global-library asset placed on the timeline was missing from its media
 * allowlist and the cross-project guard stripped the clip on every mount.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    const bootstrap = await getEditorBootstrap(id, user.id);
    if (!bootstrap) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(bootstrap);
  } catch (error) {
    return handleRouteError(error);
  }
}
