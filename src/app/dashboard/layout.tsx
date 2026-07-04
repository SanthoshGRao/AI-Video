"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { ToastContainer } from "@/components/shared/toast-container";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <Sidebar />
      <TopNav />

      <main
        className={cn(
          "pt-[60px] min-h-screen transition-all duration-300",
          sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"
        )}
      >
        <div className="p-6 lg:p-8 max-w-[1440px]">
          {children}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
