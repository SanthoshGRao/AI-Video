"use client";

import { ChevronRight, Home } from "lucide-react";
import { useFolderPath } from "@/lib/media/use-folder-path";

export function FolderBreadcrumb({
  currentFolderId,
  onNavigate,
}: {
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
}) {
  const { path: breadcrumbs } = useFolderPath(currentFolderId);

  return (
    <div className="flex items-center gap-1 text-sm px-4 py-2 bg-slate-50 rounded-lg border border-slate-100 overflow-x-auto">
      {breadcrumbs.map((item, idx) => (
        <div key={item.id ?? "root"} className="flex items-center gap-1 whitespace-nowrap">
          <button
            onClick={() => onNavigate(item.id)}
            className="text-slate-600 hover:text-slate-900 hover:underline transition"
          >
            {idx === 0 ? (
              <Home className="w-4 h-4 inline mr-1" />
            ) : null}
            {item.name}
          </button>
          {idx < breadcrumbs.length - 1 && (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
      ))}
    </div>
  );
}
