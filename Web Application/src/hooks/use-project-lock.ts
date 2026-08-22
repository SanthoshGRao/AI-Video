"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ProjectLockState = {
  heldBy: {
    userId: string;
    userName: string | null;
    acquiredAt: string;
    heartbeatAt: string;
  } | null;
  isMine: boolean;
  isStale: boolean;
  canEdit: boolean;
  heartbeatMs: number;
};

const FREE: ProjectLockState = {
  heldBy: null,
  isMine: false,
  isStale: false,
  canEdit: true,
  heartbeatMs: 30_000,
};

/**
 * Hold the editing lock on a shared project for as long as this page is open.
 *
 * Claims the lock on mount, refreshes it on an interval, and releases it on the
 * way out. If a teammate already holds a live lock the claim is refused and the
 * caller lands in read-only until they choose to take over.
 *
 * Personal projects always report `canEdit`, because the server does not lock
 * them at all.
 */
export function useProjectLock(projectId: string | undefined) {
  const [state, setState] = useState<ProjectLockState>(FREE);
  const [ready, setReady] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const claim = useCallback(
    async (takeover: boolean): Promise<ProjectLockState | null> => {
      if (!projectId) return null;
      try {
        const res = await fetch(`/api/projects/${projectId}/lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ takeover }),
        });
        // 409 still carries the current holder, which is exactly what the
        // banner needs to name them.
        const data = (await res.json()) as ProjectLockState;
        setState(data);
        return data;
      } catch {
        return null;
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    void (async () => {
      const first = await claim(false);
      if (cancelled) return;
      setReady(true);

      // Only the holder heartbeats. A read-only viewer polls instead, so the
      // banner clears on its own once the other person closes the editor.
      const interval = first?.isMine
        ? first.heartbeatMs
        : (first?.heartbeatMs ?? FREE.heartbeatMs) / 2;

      heartbeatRef.current = setInterval(() => {
        void (async () => {
          if (!projectId) return;
          try {
            const res = await fetch(`/api/projects/${projectId}/lock`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ takeover: false }),
            });
            setState((await res.json()) as ProjectLockState);
          } catch {
            /* a dropped beat is not worth surfacing; the next one retries */
          }
        })();
      }, interval);
    })();

    const release = () => {
      // keepalive lets the release survive the page actually unloading.
      navigator.sendBeacon?.(`/api/projects/${projectId}/lock/release`);
    };
    window.addEventListener("pagehide", release);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", release);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      void fetch(`/api/projects/${projectId}/lock`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
    };
  }, [projectId, claim]);

  const takeOver = useCallback(() => claim(true), [claim]);

  return {
    lock: state,
    /** False until the first claim resolves, so the UI doesn't flash a banner. */
    ready,
    /** True when a teammate holds a live lock and this session must not save. */
    isReadOnly: ready && !state.canEdit,
    takeOver,
  };
}
