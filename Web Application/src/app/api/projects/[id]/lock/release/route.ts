import prisma from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Release the lock via POST, so `navigator.sendBeacon` can call it.
 *
 * The editor already releases with a keepalive DELETE on unmount, which covers
 * client-side navigation. A real page unload is less forgiving — beacon is the
 * only request the browser reliably still sends — and DELETE is not something
 * beacon can issue, hence this POST twin.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    await prisma.projectLock.deleteMany({
      where: { projectId: id, userId: user.id },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
