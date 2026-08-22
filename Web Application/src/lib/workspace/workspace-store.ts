"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const PERSONAL_WORKSPACE_ID = "personal";

export type WorkspaceMemberInfo = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  isOwner?: boolean;
};

export type WorkspaceInfo = {
  id: string;
  name: string;
  workspaceKey: string;
  ownerId?: string;
  isOwner?: boolean;
  projectCount?: number;
  members?: WorkspaceMemberInfo[];
  /** True for the synthetic "Personal" entry, which has no server row. */
  isPersonal?: boolean;
};

const STORAGE_KEY = "active_workspace_id";
const EVENT_NAME = "workspace-switch-event";

/**
 * Personal is not a Workspace row — it is the absence of one (`workspaceId:
 * null`). The sidebar still needs something to render and select, so it is
 * synthesized here and understood by name on the server.
 */
export const PERSONAL_WORKSPACE: WorkspaceInfo = {
  id: PERSONAL_WORKSPACE_ID,
  name: "Personal",
  workspaceKey: "",
  isPersonal: true,
  members: [],
};

export function getActiveWorkspaceId(): string {
  if (typeof window === "undefined") return PERSONAL_WORKSPACE_ID;
  return localStorage.getItem(STORAGE_KEY) || PERSONAL_WORKSPACE_ID;
}

export function setActiveWorkspaceId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { id } }));
}

async function fetchWorkspaces(): Promise<WorkspaceInfo[]> {
  const res = await fetch("/api/workspaces");
  if (!res.ok) throw new Error("Failed to load workspaces");
  const data = (await res.json()) as { workspaces?: WorkspaceInfo[] };
  return data.workspaces ?? [];
}

/**
 * The sidebar's workspace list plus the currently selected scope.
 *
 * Switching scope invalidates the project queries rather than filtering
 * client-side, because each scope is a different server query — a teammate's
 * projects were never in the cache to filter.
 */
export function useActiveWorkspace() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
  });

  const joined = data ?? [];
  const workspaces: WorkspaceInfo[] = [PERSONAL_WORKSPACE, ...joined];

  const [activeWsId, setActiveWsId] = useState<string>(PERSONAL_WORKSPACE_ID);

  // Read from localStorage after mount only — reading during render would make
  // the server and client markup disagree and hydration would blow up.
  useEffect(() => {
    setActiveWsId(getActiveWorkspaceId());

    const onSwitch = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) setActiveWsId(detail.id);
    };
    window.addEventListener(EVENT_NAME, onSwitch);
    return () => window.removeEventListener(EVENT_NAME, onSwitch);
  }, []);

  // A workspace the user has since left would otherwise leave the dashboard
  // pointed at a scope that no longer exists.
  useEffect(() => {
    if (isLoading || activeWsId === PERSONAL_WORKSPACE_ID) return;
    if (!joined.some((w) => w.id === activeWsId)) {
      setActiveWorkspaceId(PERSONAL_WORKSPACE_ID);
      setActiveWsId(PERSONAL_WORKSPACE_ID);
    }
  }, [isLoading, joined, activeWsId]);

  const switchWorkspace = useCallback(
    (id: string) => {
      setActiveWorkspaceId(id);
      setActiveWsId(id);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    [queryClient]
  );

  const activeWs =
    workspaces.find((w) => w.id === activeWsId) ?? PERSONAL_WORKSPACE;

  return {
    /** Personal first, then joined workspaces. */
    workspaces,
    /** Only real workspaces — no Personal. */
    joinedWorkspaces: joined,
    activeWs,
    activeWsId,
    isPersonal: activeWsId === PERSONAL_WORKSPACE_ID,
    isLoading,
    switchWorkspace,
    refetchWorkspaces: refetch,
  };
}

/** Just the active scope id, for callers that don't need the whole list. */
export function useActiveWorkspaceId(): string {
  const [id, setId] = useState<string>(PERSONAL_WORKSPACE_ID);

  useEffect(() => {
    setId(getActiveWorkspaceId());
    const onSwitch = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) setId(detail.id);
    };
    window.addEventListener(EVENT_NAME, onSwitch);
    return () => window.removeEventListener(EVENT_NAME, onSwitch);
  }, []);

  return id;
}

/** Deterministic colour per workspace, so the same team keeps the same chip. */
export const WORKSPACE_COLORS = [
  "bg-emerald-600 text-white border-emerald-500",
  "bg-indigo-600 text-white border-indigo-500",
  "bg-rose-600 text-white border-rose-500",
  "bg-amber-600 text-white border-amber-500",
  "bg-purple-600 text-white border-purple-500",
  "bg-cyan-600 text-white border-cyan-500",
];

export function workspaceColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return WORKSPACE_COLORS[hash % WORKSPACE_COLORS.length];
}
