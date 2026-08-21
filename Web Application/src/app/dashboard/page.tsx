"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen,
  Video,
  TrendingUp,
  Plus,
  ArrowRight,
  Clock,
  Zap,
  ImageIcon,
  Images,
  Palette,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useDashboardStats } from "@/hooks/use-projects";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatEventType(type: string) {
  return type.replace(/_/g, " ");
}

/** Renders a project's ProjectStatus enum as a status pill — RENDERING gets
 * the live pulse since it's the one state actually in flight right now. */
function StatusPill({ status }: { status: string }) {
  if (status === "EXPORTED") {
    return <span className="status-pill status-pill-done">Exported</span>;
  }
  if (status === "RENDERING") {
    return (
      <span className="status-pill status-pill-progress">
        <span className="live-dot" />
        Rendering
      </span>
    );
  }
  return (
    <span className="status-pill status-pill-progress">
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

function useMe() {
  const [me, setMe] = useState<{ name: string | null; email: string } | null>(null);
  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setMe(data))
      .catch(() => {});
  }, []);
  return me;
}

const WAVE_DELAYS = [0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.1, 0.2, 0.05, 0.15, 0.25, 0.08, 0.22, 0.02, 0.28, 0.14, 0.09, 0.19, 0.29, 0.03];

export default function DashboardPage() {
  const router = useRouter();
  const { data, isLoading } = useDashboardStats();
  const me = useMe();

  const creditsUsed = data?.stats.creditsUsed ?? 0;
  const creditsLimit = data?.stats.creditsLimit ?? 0;
  const creditsPct = creditsLimit > 0 ? Math.min(100, Math.round((creditsUsed / creditsLimit) * 100)) : 0;

  const stats = [
    {
      label: "Projects",
      value: String(data?.stats.totalProjects ?? 0),
      caption: "Total projects created",
      icon: FolderOpen,
    },
    {
      label: "Videos Generated",
      value: String(data?.stats.videosExported ?? 0),
      caption: "AI videos generated",
      icon: Video,
    },
    {
      label: "This Month",
      value: String(data?.stats.exportsThisMonth ?? 0),
      caption: "Videos exported this month",
      icon: TrendingUp,
    },
  ];

  const recentProjects = data?.recentProjects ?? [];
  const recentActivity = data?.recentActivity ?? [];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-10"
    >
      {/* ============================================
          HEADER + WAVEFORM
          ============================================ */}
      <motion.div variants={item}>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--primary-600)] mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold text-[var(--text-primary)] tracking-tight leading-tight">
              Welcome back{me?.name ? `, ${me.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-base text-[var(--text-secondary)] mt-3 max-w-lg">
              Continue creating amazing AI-powered real estate marketing videos.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => router.push("/dashboard/projects/new")}
            className="self-start sm:self-auto"
          >
            <Plus className="w-5 h-5" />
            New Project
          </Button>
        </div>
        <div className="flex items-end gap-[2px] h-7 mt-6 opacity-70" aria-hidden="true">
          {WAVE_DELAYS.map((delay, i) => (
            <div
              key={i}
              className="wave-bar flex-1 max-w-[4px] rounded-sm"
              style={{
                background: "linear-gradient(180deg, var(--primary-500), var(--primary-700))",
                animationDelay: `${delay}s`,
                height: "100%",
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* ============================================
          QUICK ACTIONS
          ============================================ */}
      <motion.div variants={item}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "New project",
              caption: "Start from a property template",
              icon: Plus,
              href: "/dashboard/projects/new",
              featured: true,
            },
            {
              label: "Media library",
              caption: "Photos, videos & drone shots",
              icon: Images,
              href: "/dashboard/library",
            },
            {
              label: "Brand kit",
              caption: "Logo, colors & fonts",
              icon: Palette,
              href: "/dashboard/brand-kit",
            },
            {
              label: "Analytics",
              caption: "Usage & export stats",
              icon: BarChart3,
              href: "/dashboard/analytics",
            },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => router.push(action.href)}
              className={
                action.featured
                  ? "group text-left rounded-xl p-4 transition-all duration-200 border border-[var(--primary-600)] bg-[var(--primary-600)] hover:bg-[var(--primary-700)] shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  : "group text-left rounded-xl p-4 transition-all duration-200 border border-[var(--border-default)] bg-[var(--bg-primary)] hover:border-[var(--primary-300)] hover:shadow-md hover:-translate-y-0.5"
              }
            >
              <div
                className={
                  action.featured
                    ? "w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center mb-3"
                    : "w-9 h-9 rounded-lg bg-[var(--primary-50)] flex items-center justify-center mb-3 group-hover:bg-[var(--primary-100)] transition-colors"
                }
              >
                <action.icon
                  className={
                    action.featured
                      ? "w-[18px] h-[18px] text-white"
                      : "w-[18px] h-[18px] text-[var(--primary-600)]"
                  }
                />
              </div>
              <p
                className={
                  action.featured
                    ? "text-sm font-semibold text-white"
                    : "text-sm font-semibold text-[var(--text-primary)]"
                }
              >
                {action.label}
              </p>
              <p
                className={
                  action.featured
                    ? "text-xs text-white/70 mt-0.5"
                    : "text-xs text-[var(--text-tertiary)] mt-0.5"
                }
              >
                {action.caption}
              </p>
            </button>
          ))}
        </div>
      </motion.div>

      {/* ============================================
          STATISTICS WIDGETS (+ AI Credits)
          ============================================ */}
      <motion.div variants={item}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((stat) => (
            <Card
              key={stat.label}
              className="group hover:border-[var(--primary-300)] hover:shadow-md transition-all duration-200"
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-9 h-9 rounded-lg bg-[var(--primary-50)] flex items-center justify-center group-hover:bg-[var(--primary-100)] transition-colors">
                    <stat.icon className="w-[18px] h-[18px] text-[var(--primary-600)]" />
                  </div>
                </div>
                <p className="text-3xl font-semibold text-[var(--text-primary)]">
                  {stat.value}
                </p>
                <p className="text-sm text-[var(--text-secondary)] font-medium mt-1">
                  {stat.label}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{stat.caption}</p>
              </CardContent>
            </Card>
          ))}

          <Card className="group hover:border-[var(--primary-300)] hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="w-9 h-9 rounded-lg bg-[var(--primary-50)] flex items-center justify-center group-hover:bg-[var(--primary-100)] transition-colors">
                  <Zap className="w-[18px] h-[18px] text-[var(--primary-600)]" />
                </div>
              </div>
              <p className="text-3xl font-semibold text-[var(--text-primary)]">
                {creditsUsed}
                <span className="text-base font-medium text-[var(--text-tertiary)]"> / {creditsLimit}</span>
              </p>
              <p className="text-sm text-[var(--text-secondary)] font-medium mt-1">AI Credits</p>
              <div className="h-1.5 rounded-full bg-[var(--primary-100)] mt-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${creditsPct}%`,
                    background: creditsPct >= 90 ? "var(--warning-500)" : "var(--primary-500)",
                  }}
                />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
                {creditsPct}% of this cycle&apos;s credits used
              </p>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* ============================================
          RECENT PROJECTS SECTION
          ============================================ */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              Recent Projects
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Your latest work
            </p>
          </div>
          {recentProjects.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard/projects")}
            >
              View all
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : recentProjects.length === 0 ? (
          <Card className="border border-dashed border-[var(--border-default)]">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-6">
                <FolderOpen className="w-8 h-8 text-[var(--text-tertiary)]" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                No projects yet
              </h3>
              <p className="text-sm text-[var(--text-secondary)] text-center max-w-sm mb-8">
                Create your first property video project. Enter property details and let AI
                generate scripts, voiceovers, and marketing content.
              </p>
              <Button onClick={() => router.push("/dashboard/projects/new")}>
                <Plus className="w-4 h-4" />
                Create First Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-[var(--border-subtle)]">
              {recentProjects.map((project) => {
                const thumb = project.mediaAssets?.[0]?.thumbnailUrl ?? project.mediaAssets?.[0]?.r2Url;
                return (
                  <div
                    key={project.id}
                    onClick={() => router.push(`/dashboard/projects/${project.id}/content`)}
                    className="group flex items-center gap-4 p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <div className="w-16 h-16 rounded-lg bg-[var(--bg-tertiary)] shrink-0 overflow-hidden flex items-center justify-center">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-[var(--text-tertiary)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {project.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {project.template && (
                          <Badge variant="secondary" className="text-[10px]">
                            {project.template.name}
                          </Badge>
                        )}
                        <StatusPill status={project.status} />
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {project._count?.scriptVersions ?? 0}{" "}
                          {(project._count?.scriptVersions ?? 0) === 1 ? "script" : "scripts"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-[var(--text-tertiary)] font-mono">
                        {relativeTime(project.updatedAt)}
                      </span>
                      <ArrowRight className="w-4 h-4 text-[var(--text-tertiary)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* ============================================
          RECENT ACTIVITY
          ============================================ */}
      <motion.div variants={item}>
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Recent Activity
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            What you've been working on
          </p>
        </div>

        <Card>
          <CardContent className="py-0">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-5 text-center">
                <div className="w-12 h-12 rounded-xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-3">
                  <Clock className="w-6 h-6 text-[var(--text-tertiary)]" />
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Your activity will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {recentActivity.map((event, index) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-4 py-4 px-5 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <div className="flex-shrink-0">
                      {event.eventType.includes("success") ||
                      event.eventType.includes("completed") ? (
                        <div className="w-2 h-2 rounded-full bg-[var(--status-done)]" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-[var(--primary-500)]" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-primary)] capitalize">
                        {formatEventType(event.eventType)}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono">
                        {relativeTime(event.createdAt)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
