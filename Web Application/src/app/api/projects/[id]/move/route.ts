import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { trackEvent } from "@/lib/analytics/track";
import {
  PERSONAL_WORKSPACE_ID,
  isWorkspaceMember,
} from "@/lib/workspace/access";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Move a project between Personal and a workspace.
 *
 * Restricted to the project's creator. Everyone inside a workspace is an equal
 * editor, but pulling shared work out from under the rest of the team is a
 * different kind of act from editing it, so it stays with whoever made it.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user, project, isOwner } = await requireProjectAccess(id);

    if (!isOwner) {
      return Response.json(
        { error: "Only the person who created this project can move it" },
        { status: 403 }
      );
    }

    const { workspaceId } = (await request.json().catch(() => ({}))) as {
      workspaceId?: string | null;
    };

    const target =
      !workspaceId || workspaceId === PERSONAL_WORKSPACE_ID ? null : workspaceId;

    if (target && !(await isWorkspaceMember(user.id, target))) {
      return Response.json(
        { error: "You are not a member of that workspace" },
        { status: 403 }
      );
    }

    if (target === project.workspaceId) {
      return Response.json({ project, message: "Already there" });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { workspaceId: target },
    });

    // A lock only means something inside a workspace, and the audience just
    // changed — drop it so nobody is left holding a lock nobody can see.
    await prisma.projectLock.deleteMany({ where: { projectId: id } });

    void trackEvent(user.id, "project_moved", {
      projectId: id,
      from: project.workspaceId,
      to: target,
    });

    return Response.json({
      project: updated,
      message: target ? "Moved to workspace" : "Moved to Personal",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
