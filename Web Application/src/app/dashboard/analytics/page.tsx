"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  FolderOpen,
  FileText,
  Video,
  Mic,
  Clock,
  HardDrive,
  CheckCircle2,
  Zap,
  Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

// ---------- formatting helpers ----------

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function shortDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Round a max up to a clean axis number (1/2/5 × 10^k). */
function niceCeil(n: number) {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 5, 10]) {
    if (step * pow >= n) return step * pow;
  }
  return 10 * pow;
}

// ---------- types ----------

type AnalyticsData = {
  summary: {
    totalProjects: number;
    totalScripts: number;
    totalExports: number;
    totalVoiceovers: number;
    creditsUsed: number;
    creditsLimit: number;
  };
  dailyActivity: { date: string; count: number }[];
  exportStats: {
    done: number;
    failed: number;
    successRate: number | null;
    avgRenderSeconds: number | null;
    totalOutputBytes: number;
  };
  library: { mediaCount: number; storageBytes: number };
  eventsByType: { type: string; count: number }[];
  propertyTypes: { type: string; count: number }[];
  recentActivity: { id: string; eventType: string; createdAt: string }[];
};

// ---------- charts (single-hue, theme-token styled) ----------

/**
 * 30-day activity column chart. Single series → one hue (primary-500,
 * ≥3:1 on the card surface), no legend; hover tooltip per day; hairline
 * gridlines; sr-only table carries the exact values.
 */
function ActivityChart({ data }: { data: { date: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceCeil(Math.max(...data.map((d) => d.count))), [data]);
  const total = data.reduce((a, d) => a + d.count, 0);
  const peakIndex = useMemo(() => {
    let best = 0;
    data.forEach((d, i) => {
      if (d.count > data[best].count) best = i;
    });
    return best;
  }, [data]);

  const CHART_H = 150;
  const ticks = [max, max / 2, 0];

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[190px] text-center">
        <Activity className="w-6 h-6 text-[var(--text-tertiary)] mb-2" />
        <p className="text-sm text-[var(--text-secondary)]">
          No activity in the last 30 days
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          Generate a script or export a video to see it here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-3">
        {/* y-axis ticks */}
        <div
          className="flex flex-col justify-between text-right shrink-0 w-6"
          style={{ height: CHART_H }}
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <span key={t} className="text-[10px] leading-none text-[var(--text-tertiary)] font-mono tabular-nums">
              {t}
            </span>
          ))}
        </div>

        {/* plot area */}
        <div className="relative flex-1">
          {/* hairline gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" aria-hidden="true">
            {ticks.map((t) => (
              <div key={t} className="h-px bg-[var(--border-subtle)]" />
            ))}
          </div>

          <div className="relative flex items-end gap-[2px]" style={{ height: CHART_H }}>
            {data.map((d, i) => {
              const h = max > 0 ? Math.round((d.count / max) * CHART_H) : 0;
              return (
                <div
                  key={d.date}
                  className="relative flex-1 h-full flex items-end justify-center cursor-default"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    className="w-full max-w-[16px] rounded-t-[4px] transition-opacity"
                    style={{
                      height: Math.max(h, d.count > 0 ? 3 : 0),
                      background: "var(--primary-500)",
                      opacity: hover === null || hover === i ? 1 : 0.45,
                    }}
                  />
                  {/* selective direct label: the peak day only */}
                  {i === peakIndex && d.count > 0 && hover === null && (
                    <span className="absolute -top-4 text-[10px] font-semibold text-[var(--text-secondary)] font-mono">
                      {d.count}
                    </span>
                  )}
                  {/* tooltip */}
                  {hover === i && (
                    <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 px-2.5 py-1.5 rounded-md bg-[var(--neutral-900)] text-white text-xs whitespace-nowrap shadow-lg pointer-events-none">
                      <span className="font-semibold">{d.count}</span>{" "}
                      {d.count === 1 ? "event" : "events"}
                      <span className="text-white/60"> · {shortDay(d.date)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* x-axis labels */}
          <div className="flex justify-between mt-1.5" aria-hidden="true">
            {[0, 9, 19, 29].map((i) => (
              <span key={i} className="text-[10px] text-[var(--text-tertiary)]">
                {data[i] ? shortDay(data[i].date) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* accessible table view */}
      <table className="sr-only">
        <caption>Activity events per day, last 30 days</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Events</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Horizontal bar list for nominal categories — every bar wears the same
 * hue (identity is the row label, not the color); value sits at the bar tip.
 */
function BarList({
  items,
  emptyText,
  formatLabel,
}: {
  items: { type: string; count: number }[];
  emptyText: string;
  formatLabel?: (s: string) => string;
}) {
  if (!items.length) {
    return <p className="text-sm text-[var(--text-tertiary)] py-4">{emptyText}</p>;
  }
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="space-y-3">
      {items.slice(0, 8).map((item) => (
        <li key={item.type} className="group">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm text-[var(--text-primary)] truncate capitalize">
              {formatLabel ? formatLabel(item.type) : item.type}
            </span>
            <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono tabular-nums ml-3">
              {item.count}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
            <div
              className="h-full rounded-r-full"
              style={{
                width: `${Math.max((item.count / max) * 100, 2)}%`,
                background: "var(--primary-500)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Meter: fill + a lighter step of the same ramp as the track. */
function Meter({ pct, warn }: { pct: number; warn?: boolean }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--primary-100)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(pct, 100)}%`,
          background: warn ? "var(--warning-500)" : "var(--primary-500)",
        }}
      />
    </div>
  );
}

// ---------- page ----------

export default function AnalyticsPage() {
  const { data, isLoading, isError } = useQuery<AnalyticsData>({
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
        <CardContent className="py-12 text-center text-sm text-[var(--error-600)]">
          Could not load analytics.
        </CardContent>
      </Card>
    );
  }

  const stats = [
    { label: "Projects", value: data.summary.totalProjects, icon: FolderOpen },
    { label: "Scripts written", value: data.summary.totalScripts, icon: FileText },
    { label: "Voiceovers", value: data.summary.totalVoiceovers, icon: Mic },
    { label: "Videos exported", value: data.summary.totalExports, icon: Video },
  ];

  const creditsPct =
    data.summary.creditsLimit > 0
      ? Math.round((data.summary.creditsUsed / data.summary.creditsLimit) * 100)
      : 0;

  const { exportStats, library } = data;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-[var(--primary-50)] flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-[var(--primary-600)]" />
          </span>
          Analytics
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          Real usage across your workspace — activity is measured over the last 30 days.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="hover:border-[var(--border-hover)] transition-colors">
            <CardContent className="p-5">
              <div className="w-9 h-9 rounded-xl bg-[var(--primary-50)] flex items-center justify-center mb-3">
                <s.icon className="w-[18px] h-[18px] text-[var(--primary-600)]" />
              </div>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{s.value}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 30-day activity */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Activity — last 30 days
              </h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                Scripts generated, voiceovers created, exports and edits per day
              </p>
            </div>
            <span className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
              {data.dailyActivity.reduce((a, d) => a + d.count, 0)} total
            </span>
          </div>
          <ActivityChart data={data.dailyActivity} />
        </CardContent>
      </Card>

      {/* Export performance + library */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-[var(--primary-600)]" />
              <p className="text-xs font-semibold text-[var(--text-primary)]">Export success</p>
            </div>
            {exportStats.successRate != null ? (
              <>
                <p className="text-2xl font-semibold text-[var(--text-primary)]">
                  {exportStats.successRate}%
                </p>
                <div className="mt-2.5">
                  <Meter pct={exportStats.successRate} warn={exportStats.successRate < 80} />
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  {exportStats.done} succeeded · {exportStats.failed} failed
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">No exports yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-[var(--primary-600)]" />
              <p className="text-xs font-semibold text-[var(--text-primary)]">Avg render time</p>
            </div>
            <p className="text-2xl font-semibold text-[var(--text-primary)]">
              {formatDuration(exportStats.avgRenderSeconds)}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              {formatBytes(exportStats.totalOutputBytes)} of video produced
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4 text-[var(--primary-600)]" />
              <p className="text-xs font-semibold text-[var(--text-primary)]">Media library</p>
            </div>
            <p className="text-2xl font-semibold text-[var(--text-primary)]">
              {library.mediaCount}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              files · {formatBytes(library.storageBytes)} stored
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              What you've been doing
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">
              Events by type, last 30 days
            </p>
            <BarList
              items={data.eventsByType}
              emptyText="No events recorded yet"
              formatLabel={(s) => s.replace(/_/g, " ")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              Projects by template
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">
              All time
            </p>
            <BarList items={data.propertyTypes} emptyText="No projects yet" />
          </CardContent>
        </Card>
      </div>

      {/* Credits */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--primary-600)]" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">AI credits</span>
            </div>
            <span className="text-sm text-[var(--text-secondary)] font-mono tabular-nums">
              {data.summary.creditsUsed} / {data.summary.creditsLimit}
            </span>
          </div>
          <Meter pct={creditsPct} warn={creditsPct >= 90} />
          <p className="text-xs text-[var(--text-tertiary)] mt-2">
            {creditsPct}% of this cycle&apos;s credits used
          </p>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
            Recent activity
          </h2>
          {data.recentActivity.length ? (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {data.recentActivity.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="flex items-center gap-2.5 text-[var(--text-primary)] capitalize">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary-500)] shrink-0" />
                    {e.eventType.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)] font-mono shrink-0 ml-3">
                    {relativeTime(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">Nothing yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
