"use client";

import { motion } from "framer-motion";
import { Settings } from "lucide-react";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { TOOLS } from "@/lib/editor-v2/editor-data";

export function IconRail({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { activeTool, setActiveTool } = useEditor();

  return (
    <aside className="w-[72px] shrink-0 bg-panel border-r border-border flex flex-col items-center py-2 gap-1">
      <div className="flex-1 w-full flex flex-col items-center gap-0.5 py-1 px-2 scroll-thin overflow-y-auto">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className="group relative w-full flex flex-col items-center gap-1 py-2.5 rounded-lg transition-colors"
            >
              {active && (
                <motion.div
                  layoutId="rail-pill"
                  className="absolute inset-0 bg-brand/10 ring-1 ring-brand/30 rounded-lg"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon
                className={`size-[18px] relative z-10 transition-transform group-hover:scale-110 ${
                  active ? "text-brand-light" : "text-zinc-500 group-hover:text-zinc-200"
                }`}
                strokeWidth={active ? 2.2 : 1.7}
              />
              <span className={`text-[9px] font-medium relative z-10 leading-none tracking-tight ${
                active ? "text-brand-light" : "text-zinc-500 group-hover:text-zinc-200"
              }`}>
                {tool.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="w-full flex flex-col items-center gap-0.5 px-2 pt-2 border-t border-border">
        <button
          onClick={onOpenSettings}
          className="w-full flex flex-col items-center gap-1 py-2.5 rounded-lg hover:bg-white/5 transition"
          title="Settings"
        >
          <Settings className="size-[18px] text-zinc-500 hover:text-zinc-100" strokeWidth={1.7} />
          <span className="text-[9px] font-medium leading-none text-zinc-500 hover:text-zinc-100">Settings</span>
        </button>
      </div>
    </aside>
  );
}
