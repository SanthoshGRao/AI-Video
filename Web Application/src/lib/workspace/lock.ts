/**
 * Soft editing locks for shared projects.
 *
 * The lock is advisory: it exists so two teammates don't open the same timeline
 * and silently overwrite each other, not to make that impossible. The holder
 * refreshes its heartbeat while the editor is open, and a lock that stops
 * beating goes stale so a closed laptop never strands a project forever.
 *
 * Personal projects are never locked — there is no one to collide with, and a
 * "you have this open elsewhere" banner would be pure noise.
 */

/** A lock stops being honoured this long after its last heartbeat. */
export const LOCK_STALE_MS = 90_000;

/** How often the client should refresh — comfortably inside LOCK_STALE_MS. */
export const LOCK_HEARTBEAT_MS = 30_000;

export type LockState = {
  /** Null when nobody holds it, or the project isn't shared. */
  heldBy: {
    userId: string;
    userName: string | null;
    acquiredAt: string;
    heartbeatAt: string;
  } | null;
  /** True when the caller is the holder. */
  isMine: boolean;
  /** True when the holder's heartbeat lapsed — the lock can be taken over. */
  isStale: boolean;
  /** True when the caller may edit: no live lock, or it's theirs. */
  canEdit: boolean;
};

export function isStale(heartbeatAt: Date, now = Date.now()): boolean {
  return now - heartbeatAt.getTime() > LOCK_STALE_MS;
}

export function describeLock(
  lock:
    | { userId: string; userName: string | null; acquiredAt: Date; heartbeatAt: Date }
    | null,
  viewerId: string
): LockState {
  if (!lock) {
    return { heldBy: null, isMine: false, isStale: false, canEdit: true };
  }

  const stale = isStale(lock.heartbeatAt);
  const mine = lock.userId === viewerId;

  return {
    heldBy: {
      userId: lock.userId,
      userName: lock.userName,
      acquiredAt: lock.acquiredAt.toISOString(),
      heartbeatAt: lock.heartbeatAt.toISOString(),
    },
    isMine: mine,
    isStale: stale,
    canEdit: mine || stale,
  };
}
