import type { Project, User } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import { unauthorized, notFound } from "@/lib/api/errors";
import { getOrCreateDbUser } from "./user";

export type ProjectAccess = {
  user: User;
  project: Project;
};

/**
 * Centralized ownership check for all /api/projects/[id]/* routes.
 */
export async function requireProjectAccess(
  projectId: string
): Promise<ProjectAccess> {
  const user = await getOrCreateDbUser();
  if (!user) {
    throw unauthorized();
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
  });

  if (!project) {
    throw notFound("Project not found");
  }

  return { user, project };
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
      project: { userId },
    },
  });

  if (!script) {
    throw notFound("Script not found");
  }

  return script;
}
