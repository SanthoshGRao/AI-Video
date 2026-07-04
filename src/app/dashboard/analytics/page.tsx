"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  FolderOpen,
  FileText,
  Video,
  Mic,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AnalyticsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics"],
    queryFn: () =>
      fetch("/api/analytics").then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-rose-600">
          Could not load analytics.
        </CardContent>
      </Card>
    );
  }

  const stats = [
    {
      label: "Projects",
      value: data.summary.totalProjects,
      icon: FolderOpen,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      label: "Scripts",
      value: data.summary.totalScripts,
      icon: FileText,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "Voiceovers",
      value: data.summary.totalVoiceovers,
      icon: Mic,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Exports",
      value: data.summary.totalExports,
      icon: Video,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          Analytics
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Usage across your projects — last 30 days
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="p-5">
              <div
                className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}
              >
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">
              Property types
            </h2>
            {data.propertyTypes?.length ? (
              <ul className="space-y-3">
                {data.propertyTypes.map(
                  (p: { type: string; count: number }) => (
                    <li key={p.type} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{p.type}</span>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 rounded-full bg-indigo-500"
                          style={{
                            width: `${Math.min(p.count * 24, 120)}px`,
                          }}
                        />
                        <span className="text-xs font-semibold text-slate-500 w-6 text-right">
                          {p.count}
                        </span>
                      </div>
                    </li>
                  )
                )}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No projects yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Recent activity
            </h2>
            <ul className="space-y-3 max-h-[280px] overflow-y-auto">
              {data.recentActivity?.map(
                (e: { id: string; eventType: string; createdAt: string }) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0"
                  >
                    <span className="text-slate-700 capitalize">
                      {e.eventType.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-slate-400">
                      {relativeTime(e.createdAt)}
                    </span>
                  </li>
                )
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">AI credits used</span>
            <span className="text-sm font-semibold text-slate-900">
              {data.summary.creditsUsed} / {data.summary.creditsLimit}
            </span>
          </div>
          <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
              style={{
                width: `${Math.min(
                  (data.summary.creditsUsed / data.summary.creditsLimit) * 100,
                  100
                )}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
