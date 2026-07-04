"use client";

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { ASPECTS, TOOLS, SHORTCUTS } from "@/lib/editor-v2/editor-data";
import { Download, Keyboard, Play, Save, Scissors, ZoomIn } from "lucide-react";
import { toast } from "sonner";

export function CommandPalette() {
  const {
    commandOpen, setCommandOpen, setActiveTool, setAspect,
    togglePlay, setExportOpen, setShortcutsOpen, save,
    selectedClipIds, splitClipAtPlayhead, pushHistory,
  } = useEditor();

  const run = (fn: () => void) => { fn(); setCommandOpen(false); };

  const kbd = (id: string) => SHORTCUTS.find((s) => s.id === id)?.keys;

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Search actions, tools, presets…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => togglePlay())}>
            <Play className="size-4" /> Play / Pause
            <span className="ml-auto text-[10px] font-mono text-zinc-500">{kbd("play")}</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => setExportOpen(true))}>
            <Download className="size-4" /> Export project
            <span className="ml-auto text-[10px] font-mono text-zinc-500">{kbd("export")}</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => { save(); toast.success("Project saved"); })}>
            <Save className="size-4" /> Save project
            <span className="ml-auto text-[10px] font-mono text-zinc-500">{kbd("save")}</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => {
            const clipId = selectedClipIds[0];
            if (!clipId) {
              toast.message("Select a clip first");
              return;
            }
            pushHistory();
            splitClipAtPlayhead(clipId);
            toast.success("Clip split at playhead");
          })}>
            <Scissors className="size-4" /> Split clip
            <span className="ml-auto text-[10px] font-mono text-zinc-500">{kbd("split")}</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => setShortcutsOpen(true))}>
            <Keyboard className="size-4" /> Keyboard shortcuts
            <span className="ml-auto text-[10px] font-mono text-zinc-500">{kbd("help")}</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Switch Tool">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <CommandItem key={t.id} onSelect={() => run(() => setActiveTool(t.id))}>
                <Icon className="size-4" /> {t.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Canvas Aspect">
          {ASPECTS.map((a) => (
            <CommandItem key={a.id} onSelect={() => run(() => setAspect(a.id))}>
              <ZoomIn className="size-4" /> {a.preset}
              <span className="text-zinc-500 ml-1">· {a.id}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
