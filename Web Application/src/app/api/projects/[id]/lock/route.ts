import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { describeLock, isStale, LOCK_HEARTBEAT_MS } from "@/lib/workspace/lock";

type RouteContext = { params: Promise<{ id: string }> };

const FREE_LOCK = {
  heldBy: null,
  isMine: false,
  isStale: false,
  canEdit: true,
  heartbeatMs: LOCK_HEARTBEAT_MS,
};

/** Who, if anyone, is currently editing this project. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user, project } = await requireProjectAccess(id);

    // Nothing to collide with on a private project.
    if (!project.workspaceId) return Response.json(FREE_LOCK);

    const lock = await prisma.projectLock.findUnique({ where: { projectId: id } });
    return Response.json({
      ...describeLock(lock, user.id),
      heartbeatMs: LOCK_HEARTBEAT_MS,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Claim the lock, or refresh one already held.
 *
 * Refused with 409 when someone else holds a lock that is still beating, unless
 * the caller explicitly asks to take over — which is what the banner's "Take
 * over" button does once a person has decided the other session is abandoned.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user, project } = await requireProjectAccess(id);

    if (!project.workspaceId) return Response.json(FREE_LOCK);

    const { takeover } = (await request.json().catch(() => ({}))) as {
      takeover?: boolean;
    };

    const existing = await prisma.projectLock.findUnique({
      where: { projectId: id },
    });

    if (
      existing &&
      existing.userId !== user.id &&
      !isStale(existing.heartbeatAt) &&
      !takeover
    ) {
      return Response.json(
        {
          ...describeLock(existing, user.id),
          heartbeatMs: LOCK_HEARTBEAT_MS,
          error: "Someone else is editing this project",
        },
        { status: 409 }
      );
    }

    const displayName = user.name ?? user.email ?? "A teammate";

    // Upsert on the unique projectId, so two people racing for a free lock
    // resolve to one row rather than a duplicate-key crash.
    const lock = await prisma.projectLock.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        userId: user.id,
        userName: displayName,
        heartbeatAt: new Date(),
      },
      update: {
        userId: user.id,
        userName: displayName,
        heartbeatAt: new Date(),
        // A takeover is a new editing session, so restart the clock; a plain
        // heartbeat from the same holder leaves acquiredAt where it was.
        ...(existing && existing.userId !== user.id
          ? { acquiredAt: new Date() }
          : {}),
      },
    });

    return Response.json({
      ...describeLock(lock, user.id),
      heartbeatMs: LOCK_HEARTBEAT_MS,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Release the lock on the way out of the editor. Only the holder may. */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user, project } = await requireProjectAccess(id);

    if (!project.workspaceId) return Response.json(FREE_LOCK);

    await prisma.projectLock.deleteMany({
      where: { projectId: id, userId: user.id },
    });

    return Response.json(FREE_LOCK);
  } catch (error) {
    return handleRouteError(error);
  }
}
