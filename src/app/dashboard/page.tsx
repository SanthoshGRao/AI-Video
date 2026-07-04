"use client";

import { motion } from "framer-motion";
import {
  FolderOpen,
  Video,
  Sparkles,
  TrendingUp,
  Plus,
  ArrowRight,
  Clock,
  FileVideo,
  Mic,
  Hash,
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
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
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

const quickActions = [
  {
    title: "Create Property Video",
    description: "Enter property details and generate marketing content",
    icon: FileVideo,
    href: "/dashboard/projects/new",
    gradient: "from-[var(--primary-500)] to-[var(--primary-700)]",
  },
  {
    title: "Generate Script",
    description: "AI-powered script writing for property marketing",
    icon: Sparkles,
    href: "/dashboard/projects/new",
    gradient: "from-[#8B5CF6] to-[#6D28D9]",
  },
  {
    title: "TTS Voiceover",
    description: "Convert scripts to natural Kannada voiceovers",
    icon: Mic,
    href: "/dashboard/projects/new",
    gradient: "from-[var(--success-500)] to-[#047857]",
  },
  {
    title: "Social Content",
    description: "Instagram, WhatsApp, YouTube — all platforms",
    icon: Hash,
    href: "/dashboard/projects/new",
    gradient: "from-[var(--warning-500)] to-[#D97706]",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const { data, isLoading } = useDashboardStats();

  const stats = [
    {
      label: "Total Projects",
      value: String(data?.stats.totalProjects ?? 0),
      change: null,
      icon: FolderOpen,
      color: "var(--primary-500)",
      bg: "var(--primary-50)",
    },
    {
      label: "Videos Generated",
      value: String(data?.stats.videosExported ?? 0),
      change: null,
      icon: Video,
      color: "var(--success-500)",
      bg: "var(--success-50)",
    },

    {
      label: "This Month",
      value: String(data?.stats.exportsThisMonth ?? 0),
      change: null,
      icon: TrendingUp,
      color: "var(--accent-500)",
      bg: "var(--accent-50)",
    },
  ];

  const recentProjects = data?.recentProjects ?? [];
  const recentActivity = data?.recentActivity ?? [];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Welcome Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Create stunning property marketing videos with AI
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => router.push("/dashboard/projects/new")}
          className="shadow-lg shadow-[rgba(79,70,229,0.2)]"
        >
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="hover:border-[var(--border-hover)] transition-all group"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ backgroundColor: stat.bg }}
                >
                  <stat.icon
                    className="w-[18px] h-[18px]"
                    style={{ color: stat.color }}
                  />
                </div>
                {stat.change && (
                  <Badge variant="success" className="text-[10px]">
                    {stat.change}
                  </Badge>
                )}
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                {stat.value}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {stat.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Card
              key={action.title}
              className="card-interactive cursor-pointer group overflow-hidden"
              onClick={() => router.push(action.href)}
            >
              <CardContent className="p-5">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-4 shadow-sm group-hover:shadow-md transition-all group-hover:scale-110`}
                >
                  <action.icon className="w-[18px] h-[18px] text-white" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                  {action.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {action.description}
                </p>
                <div className="flex items-center gap-1 mt-3 text-xs font-medium text-[var(--primary-600)] opacity-0 group-hover:opacity-100 transition-opacity">
                  Get started
                  <ArrowRight className="w-3 h-3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Recent Projects */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Recent Projects
          </h2>
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")}>
            View all
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : recentProjects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-[var(--neutral-100)] flex items-center justify-center mb-5">
                <FolderOpen className="w-7 h-7 text-[var(--neutral-400)]" />
              </div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1.5">
                No projects yet
              </h3>
              <p className="text-sm text-[var(--text-secondary)] text-center max-w-md mb-6">
                Create your first property video project. Enter property details and let AI
                generate scripts, voiceovers, and marketing content automatically.
              </p>
              <Button
                size="lg"
                onClick={() => router.push("/dashboard/projects/new")}
              >
                <Plus className="w-4 h-4" />
                Create First Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProjects.map((project) => (
              <Card
                key={project.id}
                className="card-interactive cursor-pointer"
                onClick={() =>
                  router.push(`/dashboard/projects/${project.id}/content`)
                }
              >
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1 mb-2">
                    {project.title}
                  </h3>
                  <div className="flex items-center gap-2 mb-3">
                    {project.template && (
                      <Badge variant="neutral" className="text-[10px]">
                        {project.template.name}
                      </Badge>
                    )}
                    <Badge variant="default" className="text-[10px] capitalize">
                      {project.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {project._count?.scriptVersions ?? 0} scripts · Updated{" "}
                    {relativeTime(project.updatedAt)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </motion.div>

      {/* Activity Timeline (Empty) */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Activity
          </h2>
        </div>

        <Card>
          <CardContent className="py-4">
            {recentActivity.length === 0 ? (
              <div className="flex items-center justify-center py-8 gap-3 text-sm text-[var(--text-secondary)]">
                <Clock className="w-4 h-4 text-[var(--neutral-400)]" />
                Your recent activity will appear here
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {recentActivity.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between py-3 px-2 text-sm"
                  >
                    <span className="text-[var(--text-primary)] capitalize">
                      {formatEventType(event.eventType)}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {relativeTime(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
