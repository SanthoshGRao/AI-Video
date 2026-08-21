"use client";

import { useEffect, useState } from "react";

export type WorkspaceInfo = {
  id: string;
  name: string;
  workspaceKey: string;
  role?: string;
  members?: Array<{ id: string; name: string | null; email: string }>;
};

const EVENT_NAME = "workspace-switch-event";

export function getActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("active_workspace_id");
}

export function setActiveWorkspaceId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("active_workspace_id", id);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { id } }));
}

export function useActiveWorkspace() {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const data = await res.json();
      if (data?.workspaces && data.workspaces.length > 0) {
        setWorkspaces(data.workspaces);
        const stored = getActiveWorkspaceId();
        const validStored = data.workspaces.find((w: WorkspaceInfo) => w.id === stored);
        if (validStored) {
          setActiveWsId(validStored.id);
        } else {
          setActiveWsId(data.workspaces[0].id);
          localStorage.setItem("active_workspace_id", data.workspaces[0].id);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchWorkspaces();

    const handleEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id) {
        setActiveWsId(detail.id);
      }
    };

    window.addEventListener(EVENT_NAME, handleEvent);
    return () => window.removeEventListener(EVENT_NAME, handleEvent);
  }, []);

  const switchWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    setActiveWsId(id);
  };

  const activeWs = workspaces.find((w) => w.id === activeWsId) || workspaces[0] || null;

  return {
    workspaces,
    activeWs,
    activeWsId,
    switchWorkspace,
    refetchWorkspaces: fetchWorkspaces,
  };
}

export const WORKSPACE_COLORS = [
  "bg-emerald-600 text-white border-emerald-500",
  "bg-indigo-600 text-white border-indigo-500",
  "bg-rose-600 text-white border-rose-500",
  "bg-amber-600 text-white border-amber-500",
  "bg-purple-600 text-white border-purple-500",
  "bg-cyan-600 text-white border-cyan-500",
];
