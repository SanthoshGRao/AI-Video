"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SearchDialog } from "@/components/layout/search-dialog";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

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
  const { sidebarCollapsed } = useUIStore();
  const [searchOpen, setSearchOpen] = useState(false);

  const title =
    pathname.includes("/content")
      ? "Content Studio"
      : pathTitles[pathname] ?? "Dashboard";

  return (
    <>
      <header
        className={cn(
          "fixed top-0 right-0 h-[60px] bg-white/80 backdrop-blur-xl border-b border-[var(--border-subtle)] z-30 flex items-center justify-between px-6 transition-all duration-300",
          sidebarCollapsed ? "left-[72px]" : "left-[260px]"
        )}
      >
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="default"
            className="hidden sm:flex text-[var(--text-secondary)] gap-2"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="w-4 h-4" />
            <span className="text-sm">Search</span>
            <kbd className="hidden lg:inline-flex h-5 items-center rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-400">
              ⌘K
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden text-[var(--text-secondary)]"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <Search className="w-[18px] h-[18px]" />
          </Button>

          <NotificationsPanel />

          <UserButton
            appearance={{
              elements: {
                avatarBox:
                  "w-8 h-8 ring-2 ring-transparent hover:ring-[var(--primary-200)] transition-all",
              },
            }}
          />
        </div>
      </header>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
