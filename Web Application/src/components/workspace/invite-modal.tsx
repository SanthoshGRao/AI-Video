"use client";

import { useState } from "react";
import { Copy, Check, Users, Key } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function InviteTeammatesModal({
  open,
  onOpenChange,
  workspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: {
    id: string;
    name: string;
    workspaceKey: string;
    members?: Array<{ id: string; name: string | null; email: string }>;
  } | null;
}) {
  const [copied, setCopied] = useState(false);

  if (!workspace) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(workspace.workspaceKey);
    setCopied(true);
    toast.success("Workspace Join Code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[var(--surface,#18181c)] border-[var(--border-subtle,#2e2e38)]">
        <DialogHeader>
          <div className="w-10 h-10 rounded-xl bg-[#2E8F63]/10 text-[#2E8F63] flex items-center justify-center mb-2">
            <Users className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base font-bold text-[var(--text-primary)]">
            Invite Teammates
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--text-tertiary)]">
            Share this code so teammates can work together in this workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Copy Workspace Code */}
          <div className="space-y-2 p-4 rounded-xl bg-[var(--bg-subtle,#111)] border border-[var(--border-subtle)]">
            <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-[#2E8F63]" /> Workspace Code
            </label>
            <div className="flex gap-2 pt-1">
              <Input
                readOnly
                value={workspace.workspaceKey}
                className="font-mono text-xs font-bold uppercase bg-[var(--surface)] text-[var(--text-primary)]"
              />
              <Button size="sm" onClick={handleCopyCode} className="gap-1.5 shrink-0 bg-[#2E8F63] hover:bg-[#247650]">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied" : "Copy Code"}
              </Button>
            </div>
          </div>

          {/* Members List (Clean without categories or roles) */}
          {workspace.members && workspace.members.length > 0 && (
            <div className="pt-1">
              <h4 className="text-xs font-medium text-[var(--text-tertiary)] mb-2">
                Team Members ({workspace.members.length})
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {workspace.members.map((mem) => (
                  <div
                    key={mem.id}
                    className="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-subtle)]"
                  >
                    <div className="w-5 h-5 rounded-full bg-[#2E8F63]/20 text-[#2E8F63] flex items-center justify-center font-bold text-[10px]">
                      {(mem.name || mem.email)[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-[var(--text-primary)]">{mem.name || mem.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
