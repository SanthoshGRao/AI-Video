"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Settings,
  User,
  Zap,
  Bell,
  Share2,
  FileVideo,
  Trash2,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SocialConnectionsPanel } from "@/components/social/social-connections-panel";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { Users } from "lucide-react";
import {
  loadExportDefaults,
  saveExportDefaults,
  type ExportDefaults,
} from "@/lib/export-defaults";

type Me = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: "FREE" | "PRO" | "ENTERPRISE";
  creditsUsed: number;
  creditsLimit: number;
  createdAt: string;
};

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-[var(--primary-50)] flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-[var(--primary-600)]" />
          </span>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        </div>
        <div className="mt-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function ProfileCard() {
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () =>
      fetch("/api/me").then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
  });

  const [name, setName] = useState("");
  useEffect(() => {
    if (me?.name != null) setName(me.name);
  }, [me?.name]);

  const saveName = useMutation({
    mutationFn: (newName: string) =>
      fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to save");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Display name updated");
    },
    onError: () => toast.error("Could not update name"),
  });

  const dirty = !!me && name.trim() !== (me.name ?? "") && name.trim().length > 0;

  return (
    <SectionCard icon={User} title="Profile">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
            Display name
          </label>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isLoading ? "Loading…" : "Your name"}
              maxLength={80}
              disabled={isLoading}
            />
            <Button
              size="sm"
              className="shrink-0 h-9"
              disabled={!dirty || saveName.isPending}
              onClick={() => saveName.mutate(name.trim())}
            >
              {saveName.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
            Email
          </label>
          <Input value={me?.email ?? ""} disabled readOnly />
        </div>
      </div>
    </SectionCard>
  );
}

function PlanCard() {
  const { data: me } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () =>
      fetch("/api/me").then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
  });

  if (!me) return null;
  const pct =
    me.creditsLimit > 0
      ? Math.min(100, Math.round((me.creditsUsed / me.creditsLimit) * 100))
      : 0;

  return (
    <SectionCard icon={Zap} title="Plan & credits">
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary" className="uppercase tracking-wide">
          {me.plan}
        </Badge>
        <span className="text-sm text-[var(--text-secondary)] font-mono tabular-nums">
          {me.creditsUsed} / {me.creditsLimit}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--primary-100)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: pct >= 90 ? "var(--warning-500)" : "var(--primary-500)",
          }}
        />
      </div>
    </SectionCard>
  );
}

function ExportDefaultsCard() {
  const [defaults, setDefaults] = useState<ExportDefaults | null>(null);
  useEffect(() => {
    setDefaults(loadExportDefaults());
  }, []);

  const update = (patch: Partial<ExportDefaults>) => {
    setDefaults((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      saveExportDefaults(next);
      toast.success("Export defaults saved");
      return next;
    });
  };

  return (
    <SectionCard icon={FileVideo} title="Export defaults">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
            Resolution
          </label>
          <Select
            value={defaults?.resolution ?? "1080"}
            onValueChange={(v) => update({ resolution: v as ExportDefaults["resolution"] })}
            disabled={!defaults}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1080">1080p</SelectItem>
              <SelectItem value="720">720p</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
            Format
          </label>
          <Select
            value={defaults?.format ?? "mp4"}
            onValueChange={(v) => update({ format: v as ExportDefaults["format"] })}
            disabled={!defaults}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4</SelectItem>
              <SelectItem value="webm">WebM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-primary)] font-medium">Burn in subtitles</p>
        <Switch
          checked={defaults?.subtitleBurnIn ?? true}
          disabled={!defaults}
          onCheckedChange={(checked) => update({ subtitleBurnIn: checked })}
          aria-label="Burn in subtitles by default"
        />
      </div>
    </SectionCard>
  );
}

function ActivityCard() {
  const queryClient = useQueryClient();
  const [confirmClear, setConfirmClear] = useState(false);

  const { data } = useQuery<{ unreadCount: number }>({
    queryKey: ["notifications"],
    queryFn: () =>
      fetch("/api/notifications").then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
  });

  const invalidateActivity = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const markAllRead = useMutation({
    mutationFn: () => fetch("/api/notifications", { method: "PATCH" }),
    onSuccess: () => {
      invalidateActivity();
      toast.success("All notifications marked as read");
    },
  });

  const clearHistory = useMutation({
    mutationFn: () =>
      fetch("/api/notifications", { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
    onSuccess: (res: { deleted: number }) => {
      invalidateActivity();
      setConfirmClear(false);
      toast.success(`Cleared ${res.deleted} activity ${res.deleted === 1 ? "event" : "events"}`);
    },
    onError: () => toast.error("Could not clear history"),
  });

  return (
    <SectionCard icon={Bell} title="Notifications & activity">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={markAllRead.isPending || (data?.unreadCount ?? 0) === 0}
          onClick={() => markAllRead.mutate()}
        >
          <Check className="w-4 h-4" />
          Mark all read
          {(data?.unreadCount ?? 0) > 0 && (
            <span className="ml-1 text-xs text-[var(--text-tertiary)]">
              ({data?.unreadCount})
            </span>
          )}
        </Button>

        {confirmClear ? (
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={clearHistory.isPending}
              onClick={() => clearHistory.mutate()}
            >
              {clearHistory.isPending ? "Clearing…" : "Yes, clear everything"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
            <Trash2 className="w-4 h-4" />
            Clear activity history
          </Button>
        )}
      </div>
      {confirmClear && (
        <p className="text-xs text-[var(--error-600)] mt-2">
          This permanently deletes your activity feed and 30-day analytics history.
        </p>
      )}
    </SectionCard>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-[var(--primary-50)] flex items-center justify-center">
            <Settings className="w-5 h-5 text-[var(--primary-600)]" />
          </span>
          Settings
        </h1>
      </div>

      <ProfileCard />
      <PlanCard />
      <ExportDefaultsCard />
      <ActivityCard />

      <SectionCard icon={Share2} title="Social media accounts">
        <SocialConnectionsPanel />
      </SectionCard>
    </div>
  );
}
