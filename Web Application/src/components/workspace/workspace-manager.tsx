"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Loader2,
  LogOut,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PERSONAL_WORKSPACE_ID,
  useActiveWorkspace,
  workspaceColor,
  type WorkspaceInfo,
  type WorkspaceMemberInfo,
} from "@/lib/workspace/workspace-store";

function initial(value: string): string {
  return (value.trim()[0] ?? "?").toUpperCase();
}

function memberLabel(m: WorkspaceMemberInfo): string {
  return m.name || m.email.split("@")[0];
}

/** Overlapping avatars — reads as "a team" far faster than a list of chips. */
function MemberAvatars({ members }: { members: WorkspaceMemberInfo[] }) {
  const shown = members.slice(0, 4);
  const extra = members.length - shown.length;
  // A provider avatar URL can 404 or be blocked, and a broken-image glyph looks
  // like a bug. Track the ones that fail and show their initial instead.
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex -space-x-2 shrink-0">
        {shown.map((m) => (
          <span
            key={m.id}
            title={`${memberLabel(m)}${m.isOwner ? " · owner" : ""}\n${m.email}`}
            className="w-6 h-6 rounded-full ring-2 ring-[var(--bg-primary)] overflow-hidden bg-[var(--bg-hover)] flex items-center justify-center text-[10px] font-semibold text-[var(--text-secondary)]"
          >
            {m.avatarUrl && !broken[m.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setBroken((b) => ({ ...b, [m.id]: true }))}
              />
            ) : (
              initial(memberLabel(m))
            )}
          </span>
        ))}
        {extra > 0 && (
          <span className="w-6 h-6 rounded-full ring-2 ring-[var(--bg-primary)] bg-[var(--bg-hover)] flex items-center justify-center text-[10px] font-semibold text-[var(--text-secondary)]">
            +{extra}
          </span>
        )}
      </div>
      <span className="text-xs text-[var(--text-tertiary)] truncate">
        {shown.map(memberLabel).join(", ")}
        {extra > 0 ? ` +${extra}` : ""}
      </span>
    </div>
  );
}

/**
 * The join code, as a copy field rather than a terminal-looking slab.
 *
 * Deliberately built from theme tokens: the earlier version hardcoded a
 * near-black background, which read as a redaction bar on the light dashboard.
 */
function JoinCodeField({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Join code copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        Join code
      </p>
      <button
        type="button"
        onClick={copy}
        title="Click to copy"
        className="group w-full flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-left transition-colors hover:border-[var(--border-hover)]"
      >
        <code className="flex-1 font-mono text-[13px] font-semibold tracking-[0.12em] text-[var(--text-primary)] truncate">
          {code}
        </code>
        <span
          className={cn(
            "flex items-center gap-1 text-[11px] font-semibold shrink-0 transition-colors",
            copied
              ? "text-[var(--primary-500)]"
              : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
          )}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copy
            </>
          )}
        </span>
      </button>
    </div>
  );
}

function WorkspaceRow({
  workspace,
  onLeave,
  leaving,
}: {
  workspace: WorkspaceInfo;
  onLeave: (id: string) => void;
  leaving: boolean;
}) {
  const members = workspace.members ?? [];
  const projects = workspace.projectCount ?? 0;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 space-y-3.5">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0",
            workspaceColor(workspace.id)
          )}
        >
          {initial(workspace.name)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {workspace.name}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {members.length} member{members.length === 1 ? "" : "s"} · {projects}{" "}
            project{projects === 1 ? "" : "s"}
            {workspace.isOwner && " · you own this"}
          </p>
        </div>

        {confirming ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={leaving}
              onClick={() => onLeave(workspace.id)}
            >
              {leaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Leave"
              )}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title="Leave this workspace"
            className="shrink-0 p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-[var(--bg-hover)] transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>

      {members.length > 0 && <MemberAvatars members={members} />}

      {/* Only the last member left needs telling; everyone else can see the team. */}
      {members.length === 1 && (
        <p className="text-xs text-[var(--text-secondary)]">
          Share this code to bring your team in.
        </p>
      )}

      <JoinCodeField code={workspace.workspaceKey} />
    </div>
  );
}

/**
 * Workspace list plus the join/create form, shared by the sidebar dialog and the
 * Settings page.
 *
 * Both surfaces render this one component and read through `useActiveWorkspace`.
 * They used to keep separate `["workspaces"]` queries whose fetchers returned
 * different shapes — same cache key, so whichever mounted first won and the
 * other silently rendered an empty list.
 */
export function WorkspaceManager({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const { joinedWorkspaces, activeWsId, switchWorkspace, isLoading } =
    useActiveWorkspace();

  const [mode, setMode] = useState<"join" | "create">("join");
  const [joinKey, setJoinKey] = useState("");
  const [newName, setNewName] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data as { message?: string; workspace?: WorkspaceInfo; deleted?: boolean };
  };

  const joinWs = useMutation({
    mutationFn: (key: string) => post({ action: "join", workspaceKey: key }),
    onSuccess: (data) => {
      refresh();
      setJoinKey("");
      toast.success(data.message ?? "Joined workspace");
      if (data.workspace?.id) switchWorkspace(data.workspace.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createWs = useMutation({
    mutationFn: (name: string) => post({ name }),
    onSuccess: (data) => {
      refresh();
      setNewName("");
      toast.success(`Created '${data.workspace?.name ?? "workspace"}'`);
      if (data.workspace?.id) switchWorkspace(data.workspace.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leaveWs = useMutation({
    mutationFn: (workspaceId: string) => post({ action: "leave", workspaceId }),
    onSuccess: (data, workspaceId) => {
      refresh();
      toast.success(data.message ?? "Left workspace");
      if (activeWsId === workspaceId) switchWorkspace(PERSONAL_WORKSPACE_ID);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = joinWs.isPending || createWs.isPending;

  return (
    <div className={cn("space-y-4", compact && "space-y-3.5")}>
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 justify-center text-sm text-[var(--text-tertiary)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading workspaces…
        </div>
      ) : joinedWorkspaces.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-tertiary)] p-4">
          <span className="w-8 h-8 rounded-lg bg-[var(--primary-50)] flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-[var(--primary-600)]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              You&rsquo;re working solo
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Create a team to share projects, or join one with a code a
              colleague sends you.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {joinedWorkspaces.map((ws) => (
            <WorkspaceRow
              key={ws.id}
              workspace={ws}
              leaving={leaveWs.isPending}
              onLeave={(id) => leaveWs.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* One form, two modes — two side-by-side boxes made the panel feel like a
          form dump when only ever one of them is being used. */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 space-y-3">
        <div className="inline-flex w-full rounded-lg bg-[var(--bg-tertiary)] p-0.5">
          {(["join", "create"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                mode === m
                  ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              {m === "join" ? (
                <>
                  <UserPlus className="w-3.5 h-3.5" /> Join a team
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" /> Create a team
                </>
              )}
            </button>
          ))}
        </div>

        {mode === "join" ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (joinKey.trim()) joinWs.mutate(joinKey.trim());
            }}
          >
            <div className="flex gap-2">
              <Input
                value={joinKey}
                onChange={(e) => setJoinKey(e.target.value.toUpperCase())}
                placeholder="WS-A1B2-C3D4"
                className="font-mono tracking-[0.12em]"
                autoComplete="off"
              />
              <Button
                type="submit"
                className="shrink-0"
                disabled={busy || !joinKey.trim()}
              >
                {joinWs.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Join"
                )}
              </Button>
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Ask a teammate for the join code shown on their workspace.
            </p>
          </form>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) createWs.mutate(newName.trim());
            }}
          >
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Acme Realty"
                maxLength={60}
                autoComplete="off"
              />
              <Button
                type="submit"
                className="shrink-0"
                disabled={busy || !newName.trim()}
              >
                {createWs.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              You&rsquo;ll get a join code to share. Everyone in a team can open
              and edit its projects.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
