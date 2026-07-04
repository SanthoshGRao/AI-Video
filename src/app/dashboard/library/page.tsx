"use client";

import { FolderOpen } from "lucide-react";
import { MediaPanel } from "@/components/content-studio/media-panel";

export default function GlobalLibraryPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <FolderOpen className="w-8 h-8 text-indigo-500" />
            Global Media Library
          </h1>
          <p className="text-slate-500 mt-1">
            All media uploaded across your projects.
          </p>
        </div>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm p-6 min-h-[500px]">
        <MediaPanel />
      </div>
    </div>
  );
}
