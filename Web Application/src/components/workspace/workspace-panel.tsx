"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Key, Copy, Check, UserPlus, FolderOpen, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Member = {
  id: string;
  name: string | null;
  email: string;
};

type Workspace = {
  id: string;
  name: string;
  workspaceKey: string;
  projectCount: number;
  members: Member[];
};

export function WorkspacePanel() {
  const queryClient = useQueryClient();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [joinKeyInput, setJoinKeyInput] = useState("");
  const [newWsName, setNewWsName] = useState("");

  const { data, isLoading } = useQuery<{ workspaces: Workspace[] }>({
    queryKey: ["workspaces"],
    queryFn: () =>
      fetch("/api/workspaces").then((r) => {
        if (!r.ok) throw new Error("Failed to fetch workspaces");
        return r.json();
      }),
  });

  const leaveWorkspaceMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", workspaceId }),
      }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Failed to leave workspace");
        return body;
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success(data.message || "Exited workspace successfully!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to exit workspace");
    },
  });

  const joinWorkspaceMutation = useMutation({
    mutationFn: (workspaceKey: string) =>
      fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", workspaceKey }),
      }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Failed to join workspace");
        return body;
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success(data.message || "Joined team workspace successfully!");
      setJoinKeyInput("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to join workspace");
    },
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: (name: string) =>
      fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Failed to create workspace");
        return body;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("New team workspace created!");
      setNewWsName("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create workspace");
    },
  });

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success("Workspace Code copied to clipboard!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // ONLY show workspaces that have 2 OR MORE members as requested
  const allWorkspaces = data?.workspaces || [];
  const teamWorkspaces = allWorkspaces.filter((ws) => ws.members && ws.members.length >= 2);

  return (
    <div className="space-y-6">
      {/* 1. Shared Team Workspaces (2 or more members ONLY) */}
      {isLoading ? (
        <div className="text-sm text-zinc-500 py-4 flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-[#2E8F63] border-t-transparent animate-spin" />
          Loading team workspaces...
        </div>
      ) : teamWorkspaces.length === 0 ? (
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-[#2E8F63]/10 text-[#2E8F63] flex items-center justify-center mx-auto">
            <Users className="w-5 h-5" />
          </div>
          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">No Active Team Workspaces Yet</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Team workspaces with 2 or more members will appear here. Join an existing team below or share your code with a colleague to start collaborating.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {teamWorkspaces.map((ws) => (
            <div
              key={ws.id}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3.5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{ws.name}</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      {ws.members.length} Members
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Collaborative team workspace · {ws.projectCount || 0} active project(s)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link href="/dashboard/projects">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs font-semibold border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[#2E8F63]" />
                      Enter Workspace
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Are you sure you want to exit '${ws.name}'?`)) {
                        leaveWorkspaceMutation.mutate(ws.id);
                      }
                    }}
                    disabled={leaveWorkspaceMutation.isPending}
                    className="gap-1.5 text-xs font-semibold border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Exit Workspace
                  </Button>
                </div>
              </div>

              {/* Workspace Code Box with Integrated Copy Symbol */}
              <div className="p-2.5 px-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-2.5">
                  <Key className="w-4 h-4 text-emerald-500 shrink-0" />
                  <code className="text-xs font-mono font-medium tracking-wide text-[#10B981]">
                    {ws.workspaceKey}
                  </code>
                </div>

                <button
                  onClick={() => copyToClipboard(ws.workspaceKey)}
                  title="Copy Join Code"
                  className="p-1.5 px-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 border border-zinc-700/60 transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                >
                  {copiedKey === ws.workspaceKey ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[11px] text-emerald-400 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-[11px] text-zinc-400">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Join & Create Workspace Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {/* Join Workspace */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 space-y-3">
          <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#2E8F63]" /> Join a Team Workspace
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Paste a team code shared by your colleague to join their workspace.
          </p>
          <div className="flex gap-2">
            <Input
              value={joinKeyInput}
              onChange={(e) => setJoinKeyInput(e.target.value)}
              placeholder="WS-XXXX-XXXX-2026"
              className="text-xs font-mono uppercase bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:border-[#2E8F63]"
            />
            <Button
              size="sm"
              disabled={!joinKeyInput.trim() || joinWorkspaceMutation.isPending}
              onClick={() => joinWorkspaceMutation.mutate(joinKeyInput.trim())}
              className="shrink-0 bg-[#2E8F63] hover:bg-[#247650] text-white font-semibold text-xs"
            >
              {joinWorkspaceMutation.isPending ? "Joining..." : "Join"}
            </Button>
          </div>
        </div>

        {/* Create Workspace */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 space-y-3">
          <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#2E8F63]" /> Create Workspace
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Start a new team workspace for your project team or clients.
          </p>
          <div className="flex gap-2">
            <Input
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="e.g. Marketing Video Team"
              className="text-xs bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:border-[#2E8F63]"
            />
            <Button
              size="sm"
              disabled={!newWsName.trim() || createWorkspaceMutation.isPending}
              onClick={() => createWorkspaceMutation.mutate(newWsName.trim())}
              className="shrink-0 bg-[#2E8F63] hover:bg-[#247650] text-white font-semibold text-xs"
            >
              {createWorkspaceMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
