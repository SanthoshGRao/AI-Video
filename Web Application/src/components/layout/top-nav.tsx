"use client";

import { useState } from "react";
import { Search, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SearchDialog } from "@/components/layout/search-dialog";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
import { useDesktopShell } from "@/hooks/use-desktop-shell";
import { useActiveWorkspace } from "@/lib/workspace/workspace-store";
import { cn } from "@/lib/utils";

import { DesktopUpdateNavButton } from "@/components/desktop/update-banner";

const pathTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/projects": "Projects",
  "/dashboard/projects/new": "New Project",
  "/dashboard/brand-kit": "Brand Kit",
  "/dashboard/analytics": "Analytics",
  "/dashboard/settings": "Settings",
};

export function TopNav() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const isDesktopShell = useDesktopShell();
  const { activeWs } = useActiveWorkspace();

  const title =
    pathname.includes("/content")
      ? "Content Studio"
      : pathTitles[pathname] ?? "Dashboard";

  return (
    <>
      <header
        className={cn(
          "fixed top-0 h-[60px] bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)] z-30 flex items-center justify-between px-6 transition-all duration-300",
          isDesktopShell ? "right-[140px]" : "right-0",
          "left-[72px]"
        )}
        style={isDesktopShell ? ({ WebkitAppRegion: "drag" } as React.CSSProperties) : undefined}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
            {title}
          </h1>
        </div>

        <div
          className="flex items-center gap-2"
          style={isDesktopShell ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
        >
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 w-64 h-9 px-3.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:border-[var(--border-hover)] transition-colors"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="text-sm">Search projects...</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden text-[var(--text-secondary)]"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <Search className="w-[18px] h-[18px]" />
          </Button>

          <DesktopUpdateNavButton />
          <NotificationsPanel />
        </div>
      </header>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
