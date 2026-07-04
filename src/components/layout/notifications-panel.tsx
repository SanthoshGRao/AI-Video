"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, Sparkles, Video, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function eventIcon(type: string) {
  if (type.includes("script")) return Sparkles;
  if (type.includes("export") || type.includes("video")) return Video;
  if (type.includes("project")) return FileText;
  return CheckCircle2;
}

function formatEvent(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function NotificationsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      fetch("/api/notifications").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json() as Promise<{
          notifications: {
            id: string;
            eventType: string;
            metadata: unknown;
            createdAt: string;
            read: boolean;
          }[];
          unreadCount: number;
        }>;
      }),
    refetchInterval: 60000,
  });

  const unread = data?.unreadCount ?? 0;
  const items = data?.notifications ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-[var(--text-secondary)]"
          aria-label="Notifications"
        >
          <Bell className="w-[18px] h-[18px]" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[8px] h-2 px-0.5 bg-rose-500 rounded-full text-[8px] text-white flex items-center justify-center" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
          {unread > 0 && (
            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              {unread} new
            </span>
          )}
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-slate-500 p-6 text-center">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500 p-8 text-center">
              No activity yet. Create a project to get started.
            </p>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = eventIcon(n.eventType);
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/80",
                      !n.read && "bg-indigo-50/30"
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {formatEvent(n.eventType)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {relativeTime(n.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
