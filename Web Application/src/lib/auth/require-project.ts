import type { Project, User } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { unauthorized, notFound } from "@/lib/api/errors";
import { accessibleProjectWhere } from "@/lib/workspace/access";
import { getOrCreateDbUser } from "./user";

export type ProjectAccess = {
  user: User;
  project: Project;
  /** False when the project is reachable through a workspace rather than owned. */
  isOwner: boolean;
};

/**
 * Centralized access check for all /api/projects/[id]/* routes.
 *
 * Grants access to the project's creator and to every member of the workspace
 * the project belongs to. Workspace members are equals, so this one check gates
 * reads and writes alike; routes that must be creator-only (deleting a project
 * outright, moving it between workspaces) check `isOwner` themselves.
 */
export async function requireProjectAccess(
  projectId: string
): Promise<ProjectAccess> {
  const user = await getOrCreateDbUser();
  if (!user) {
    throw unauthorized();
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...(await accessibleProjectWhere(user.id)) },
  });

  if (!project) {
    throw notFound("Project not found");
  }

  return { user, project, isOwner: project.userId === user.id };
}

/**
 * Verify a script belongs to the user's project.
 */
export async function requireScriptInProject(
  scriptVersionId: string,
  projectId: string,
  userId: string
) {
  const script = await prisma.scriptVersion.findFirst({
    where: {
      id: scriptVersionId,
      projectId,
      project: await accessibleProjectWhere(userId),
    },
  });

  if (!script) {
    throw notFound("Script not found");
  }

  return script;
}
