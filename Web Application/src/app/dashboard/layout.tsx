"use client";

import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { ToastContainer } from "@/components/shared/toast-container";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <Sidebar />
      <TopNav />

      {/* Sidebar is a hover-expanding overlay rail — content always sits at
          rail width and never reflows. */}
      <main className="pt-[60px] min-h-screen ml-[72px]">
        <div className="p-6 lg:p-8 max-w-[1440px] mx-auto">
          {children}
        </div>
      </main>
      {/* Two independent toast systems exist: ToastContainer is driven by
          useUIStore, while most panels call `toast` from sonner — which
          renders nothing without a mounted <Toaster />. Sonner sits top-right
          so it never overlaps ToastContainer's bottom-right stack. */}
      <ToastContainer />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
