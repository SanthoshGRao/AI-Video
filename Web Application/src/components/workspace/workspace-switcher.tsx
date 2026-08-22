"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkspaceManager } from "@/components/workspace/workspace-manager";
import {
  useActiveWorkspace,
  workspaceColor,
} from "@/lib/workspace/workspace-store";

function initial(name: string): string {
  return (name.trim()[0] ?? "W").toUpperCase();
}

/**
 * The workspace stack in the left sidebar: Personal on top, then every team the
 * user has joined. Selecting one changes the scope of the whole dashboard —
 * projects, dashboard stats and new-project placement all follow it.
 */
export function WorkspaceStack({ expanded }: { expanded: boolean }) {
  const { workspaces, activeWsId, switchWorkspace, isLoading } =
    useActiveWorkspace();
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-3 px-3">
      {expanded && (
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
            Workspaces
          </span>
          {isLoading && (
            <Loader2 className="w-3 h-3 animate-spin text-[var(--text-tertiary)]" />
          )}
        </div>
      )}

      <div className="flex flex-col space-y-1.5">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWsId;
          const memberCount = ws.members?.length ?? 1;

          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => switchWorkspace(ws.id)}
              className={cn(
                "w-full flex items-center gap-2.5 p-1.5 rounded-xl transition-all duration-200 text-left group",
                isActive
                  ? "bg-[var(--bg-hover)] shadow-sm"
                  : "hover:bg-[var(--bg-hover)]/60",
                !expanded && "justify-center px-0 bg-transparent"
              )}
              title={
                ws.isPersonal
                  ? "Personal — only you"
                  : `${ws.name} · ${memberCount} member${memberCount === 1 ? "" : "s"}`
              }
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-sm transition-all duration-200 group-hover:scale-105",
                  ws.isPersonal
                    ? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-default)]"
                    : workspaceColor(ws.id),
                  isActive &&
                    "ring-2 ring-[#2E8F63] ring-offset-2 ring-offset-[var(--bg-primary)] scale-105"
                )}
              >
                {ws.isPersonal ? <Users className="w-3.5 h-3.5" /> : initial(ws.name)}
              </div>

              {expanded && (
                <div className="flex-1 min-w-0 flex items-center justify-between">
                  <div className="flex flex-col min-w-0">
                    <span
                      className={cn(
                        "text-xs font-semibold truncate",
                        isActive
                          ? "text-[#2E8F63]"
                          : "text-[var(--text-primary)]"
                      )}
                    >
                      {ws.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)] truncate">
                      {ws.isPersonal
                        ? "Only you"
                        : `${memberCount} member${memberCount === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  {isActive && (
                    <Check className="w-3.5 h-3.5 text-[#2E8F63] shrink-0 ml-1" />
                  )}
                </div>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className={cn(
            "w-full flex items-center gap-2.5 p-1.5 rounded-xl text-left transition-colors hover:bg-[var(--bg-hover)]/60",
            !expanded && "justify-center px-0"
          )}
          title="Create or join a workspace"
        >
          <div className="w-8 h-8 rounded-full border border-dashed border-[var(--border-subtle)] flex items-center justify-center shrink-0 text-[var(--text-tertiary)]">
            <Plus className="w-4 h-4" />
          </div>
          {expanded && (
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              New / join team
            </span>
          )}
        </button>
      </div>

      <WorkspaceManageDialog open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}

/** Thin wrapper: the dialog is just a place to put {@link WorkspaceManager}. */
export function WorkspaceManageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Workspaces</DialogTitle>
          <DialogDescription className="text-xs">
            Everyone in a workspace can open and edit the projects inside it.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto -mx-1 px-1 pt-1">
          <WorkspaceManager compact />
        </div>
      </DialogContent>
    </Dialog>
  );
}
