"use client";

import { MessagesSquare } from "lucide-react";

/** Simple, uniform thumbnail for every conversation/skit project. */
export function SkitThumbnail() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-violet-50">
      <MessagesSquare className="w-10 h-10 text-indigo-400" strokeWidth={1.5} />
    </div>
  );
}
