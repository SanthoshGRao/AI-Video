import prisma from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Sentinel used by the client for "my private projects" — the projects whose
 * `workspaceId` is null. It is not a real Workspace row, so it never appears in
 * /api/workspaces; the sidebar synthesizes it.
 */
export const PERSONAL_WORKSPACE_ID = "personal";

/** Every workspace id the user belongs to (membership, not ownership). */
export async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  return memberships.map((m) => m.workspaceId);
}

/** True when the user is a member of the workspace. */
export async function isWorkspaceMember(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });
  return !!membership;
}

/**
 * The `where` clause describing every project the user may open.
 *
 * Two disjoint sources: their own unfiled projects, and every project in a
 * workspace they currently belong to (whoever created it). Members are equals —
 * there is no viewer/editor split — so this same clause gates reads and writes.
 *
 * The first arm is deliberately `{ userId, workspaceId: null }` rather than a
 * bare `{ userId }`: a project someone created inside a team belongs to the
 * team, so once they leave that workspace it must stop being reachable by
 * direct URL. Membership, not authorship, is what grants access to filed work.
 */
export function projectAccessWhere(
  userId: string,
  workspaceIds: string[]
): Prisma.ProjectWhereInput {
  if (workspaceIds.length === 0) {
    return { userId, workspaceId: null };
  }
  return {
    OR: [
      { userId, workspaceId: null },
      { workspaceId: { in: workspaceIds } },
    ],
  };
}

/** Same clause, resolving the caller's memberships first. */
export async function accessibleProjectWhere(
  userId: string
): Promise<Prisma.ProjectWhereInput> {
  const workspaceIds = await getUserWorkspaceIds(userId);
  return projectAccessWhere(userId, workspaceIds);
}

/**
 * Narrow a project query to one sidebar scope.
 *
 * `personal` (or no scope) means the user's own unfiled projects. A workspace id
 * means that workspace's projects — but only after membership is confirmed, so a
 * guessed id can't leak another team's work.
 */
export async function scopedProjectWhere(
  userId: string,
  scopeId: string | null | undefined
): Promise<Prisma.ProjectWhereInput> {
  if (!scopeId || scopeId === PERSONAL_WORKSPACE_ID) {
    return { userId, workspaceId: null };
  }

  if (!(await isWorkspaceMember(userId, scopeId))) {
    // Not a member: fall back to personal rather than 403-ing, since a stale
    // `active_workspace_id` in localStorage (left over from a workspace the
    // user has since exited) would otherwise wedge the whole dashboard.
    return { userId, workspaceId: null };
  }

  return { workspaceId: scopeId };
}

/**
 * Resolve the workspace a newly created project should belong to.
 * Returns null for personal projects. Throws nothing — an unknown or
 * non-member workspace id silently degrades to personal.
 */
export async function resolveTargetWorkspaceId(
  userId: string,
  requested: string | null | undefined
): Promise<string | null> {
  if (!requested || requested === PERSONAL_WORKSPACE_ID) return null;
  return (await isWorkspaceMember(userId, requested)) ? requested : null;
}
