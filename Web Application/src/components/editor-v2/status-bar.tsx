"use client";

import { Activity, Cpu, HardDrive, Wifi } from "lucide-react";
import { useEditor } from "@/lib/editor-v2/editor-store";

export function StatusBar() {
  const { settings, aspect, dirty } = useEditor();

  return (
    <footer className="h-6 shrink-0 px-3 bg-panel border-t border-border flex items-center justify-between text-[9px] font-mono text-zinc-500">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${dirty ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />
          <span className="text-zinc-400">{dirty ? "Unsaved changes" : "System Ready"}</span>
        </div>
        <div className="flex items-center gap-1">
          <Activity className="size-2.5" /> {settings.fps}fps preview
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="uppercase">{settings.resolution}p • {aspect}</span>
        <div className={`flex items-center gap-1 ${dirty ? 'text-zinc-500' : 'text-emerald-400'}`}>
          <Wifi className="size-2.5" /> {dirty ? "Pending" : "Synced"}
        </div>
        <span>v4.2.1</span>
      </div>
    </footer>
  );
}
