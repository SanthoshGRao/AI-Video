"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useClerk } from "@clerk/nextjs";
import { useDesktopShell } from "@/hooks/use-desktop-shell";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  Video,
  Library,
  Palette,
  BarChart3,
  User,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceStack } from "@/components/workspace/workspace-switcher";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Projects",
    href: "/dashboard/projects",
    icon: FolderOpen,
  },
  {
    label: "Library",
    href: "/dashboard/library",
    icon: Library,
  },
  {
    label: "Brand Kit",
    href: "/dashboard/brand-kit",
    icon: Palette,
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
  },
];

function useMe() {
  const [me, setMe] = useState<{
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setMe(data))
      .catch(() => {});
  }, []);

  return me;
}

function ClerkSignOutItem() {
  const { signOut } = useClerk();
  return (
    <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/sign-in" })}>
      <LogOut className="w-4 h-4" />
      Sign out
    </DropdownMenuItem>
  );
}

function SidebarUserMenu({
  collapsed,
  onOpenChange,
}: {
  collapsed: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isDesktop = useDesktopShell();
  const me = useMe();

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors",
            collapsed && "justify-center px-0"
          )}
          title={me?.name || me?.email || "Account"}
        >
          <span className="w-8 h-8 rounded-full bg-[var(--primary-100)] flex items-center justify-center text-[var(--primary-600)] overflow-hidden shrink-0">
            {me?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-4 h-4" />
            )}
          </span>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-start flex-1 min-w-0"
              >
                <span className="text-sm font-medium text-[var(--text-primary)] truncate w-full text-left">
                  {me?.name || "Account"}
                </span>
                {me?.email && (
                  <span className="text-[11px] text-[var(--text-tertiary)] truncate w-full text-left">
                    {me.email}
                  </span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
          {!collapsed && (
            <LogOut className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate">
          {me?.name || me?.email || "Signed in"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isDesktop ? (
          <DropdownMenuItem onClick={() => window.desktopAPI?.signOut()}>
            <LogOut className="w-4 h-4" />
            Sign out
          </DropdownMenuItem>
        ) : (
          <ClerkSignOutItem />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const expanded = hovered || menuOpen;

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "fixed left-0 top-0 h-screen bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col transition-all duration-300 ease-out",
        expanded ? "w-[260px] z-50 shadow-2xl" : "w-[72px] z-40"
      )}
    >
      {/* Logo Area */}
      <div className="h-[60px] flex items-center px-4 border-b border-[var(--border-subtle)]">
        <Link href="/dashboard" className="flex items-center gap-3 group w-full">
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#4FAD7E] via-[#2E8F63] to-[#247650] flex items-center justify-center shadow-lg shadow-[rgba(46,143,99,0.25)] group-hover:shadow-xl transition-all">
              <Video className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
          </div>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col flex-1 min-w-0"
              >
                <span className="text-sm font-bold text-[var(--text-primary)] tracking-tight leading-tight">
                  Video Studio
                </span>
                <span className="text-[10px] font-semibold text-[#2E8F63] tracking-wider mt-0.5">
                  AI POWERED
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto scrollbar-hide">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              title={expanded ? undefined : item.label}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                isActive
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-indicator"
                  className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#2E8F63] rounded-r-full"
                  transition={{ type: "spring", stiffness: 380, damping: 40 }}
                />
              )}
              <item.icon
                className={cn(
                  "w-5 h-5 flex-shrink-0 transition-all",
                  isActive
                    ? "text-[#2E8F63]"
                    : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                )}
                strokeWidth={1.8}
              />
              <AnimatePresence>
                {expanded && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Workspace switcher — Personal plus every joined team */}
      <WorkspaceStack expanded={expanded} />

      {/* Bottom User Section */}
      <div className="border-t border-[var(--border-subtle)] p-3 space-y-1 mt-3">
        <SidebarUserMenu collapsed={!expanded} onOpenChange={setMenuOpen} />

        {/* Settings Link */}
        <Link
          href="/dashboard/settings"
          title={expanded ? undefined : "Settings"}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
            pathname === "/dashboard/settings"
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" strokeWidth={1.8} />
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>
    </aside>
  );
}
