import prisma from "@/lib/db/prisma";
import { ApiRouteError } from "@/lib/api/errors";
import { isStale } from "./lock";

/**
 * Refuse a write when a teammate holds a live editing lock on the project.
 *
 * This is the tooth behind the presence banner: the banner asks people not to
 * edit, and this makes the save actually fail instead of silently clobbering
 * whatever the other person has been building. Personal projects and stale
 * locks (whose holder stopped heartbeating) never block.
 *
 * Throws 423 Locked, which the client turns into "X is editing this project".
 */
export async function assertHoldsLock(
  project: { id: string; workspaceId: string | null },
  userId: string
): Promise<void> {
  if (!project.workspaceId) return;

  const lock = await prisma.projectLock.findUnique({
    where: { projectId: project.id },
  });

  if (!lock) return;
  if (lock.userId === userId) return;
  if (isStale(lock.heartbeatAt)) return;

  throw new ApiRouteError(
    `${lock.userName ?? "A teammate"} is editing this project right now, so your changes were not saved.`,
    423,
    "PROJECT_LOCKED",
    { heldBy: lock.userName, userId: lock.userId }
  );
}
