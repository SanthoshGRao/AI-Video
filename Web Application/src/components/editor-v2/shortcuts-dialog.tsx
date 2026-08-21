"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { SHORTCUTS, type Shortcut } from "@/lib/editor-v2/editor-data";
import { Keyboard } from "lucide-react";

const GROUPS: Shortcut["group"][] = ["Playback", "Editing", "Timeline", "View", "File"];

export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useEditor();

  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4" /> Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 max-h-[60vh] overflow-y-auto scroll-thin pr-2">
          {GROUPS.map((g) => {
            const items = SHORTCUTS.filter((s) => s.group === g);
            if (!items.length) return null;
            return (
              <section key={g} className="space-y-1.5">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
                  {g}
                </h3>
                <ul className="space-y-1">
                  {items.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-md hover:bg-white/[0.04] transition"
                    >
                      <span className="text-xs text-zinc-300">{s.label}</span>
                      <kbd className="text-[10px] font-mono font-semibold text-zinc-200 bg-white/[0.06] border border-border rounded px-1.5 py-0.5 shadow-sm">
                        {s.keys}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
