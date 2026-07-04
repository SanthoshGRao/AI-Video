"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface ShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  label: string;
  keys: string[];
  disabled?: boolean;
}

interface ShortcutCategory {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    title: "Global",
    items: [
      { label: "Select all", keys: ["Ctrl", "A"] },
      {
        label: "Select multiple clips",
        keys: ["Shift", "Left-Click"]
      },
      { label: "Copy", keys: ["Ctrl", "C"] },
      { label: "Cut", keys: ["Ctrl", "X"] },
      { label: "Paste", keys: ["Ctrl", "V"] },
      { label: "Duplicate", keys: ["Ctrl", "D"] },
      { label: "Delete", keys: ["Del"] },
      { label: "Undo", keys: ["Ctrl", "Z"] },
      { label: "Redo", keys: ["Ctrl", "Y"] },
      { label: "Play or pause", keys: ["Space"] },
      { label: "Text wrap", keys: ["Ctrl", "Enter"], disabled: true },
      { label: "Split sentence", keys: ["Enter"], disabled: true }
    ]
  },
  {
    title: "Timeline",
    items: [
      { label: "Split", keys: ["Ctrl", "B"] },
      { label: "Zoom timeline", keys: ["Ctrl", "Wheel"] },
      { label: "Zoom in", keys: ["+"] },
      { label: "Zoom out", keys: ["-"] },
      { label: "Scroll up or down", keys: ["Scroll"], disabled: true },
      { label: "Scroll left or right", keys: ["Shift", "Scroll"], disabled: true },
      { label: "Last frame", keys: ["Ctrl", "←"] },
      { label: "Next frame", keys: ["Ctrl", "→"] },
      { label: "Turn on or off preview axis", keys: ["S"], disabled: true },
      { label: "Attach", keys: ["N"], disabled: true },
      {
        label: "Separate or restore audio",
        keys: ["Shift", "Ctrl", "S"],
        disabled: true
      },
      { label: "Add or remove beats", keys: ["M"], disabled: true }
    ]
  },
  {
    title: "Canvas",
    items: [
      { label: "Full screen", keys: ["Shift", "Ctrl", "F"], disabled: true },
      { label: "Move", keys: ["V"], disabled: true },
      { label: "Hand tool", keys: ["H"], disabled: true },
      { label: "Zoom in", keys: ["Shift", "+"], disabled: true },
      { label: "Zoom out", keys: ["Shift", "-"], disabled: true },
      { label: "Zoom to fit", keys: ["Shift", "F"], disabled: true },
      { label: "Zoom to 50%", keys: ["Shift", "0"], disabled: true },
      { label: "Zoom to 100%", keys: ["Shift", "1"], disabled: true },
      { label: "Zoom to 200%", keys: ["Shift", "2"], disabled: true },
      { label: "Move up 1 px", keys: ["↑"] },
      { label: "Move down 1 px", keys: ["↓"] },
      { label: "Move left 1 px", keys: ["←"] },
      { label: "Move right 1 px", keys: ["→"] },
      { label: "Fine move", keys: ["Shift", "Arrow Keys"] }
    ]
  }
];

export function ShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-5xl w-full max-w-5xl border bg-card p-6 py-8 overflow-hidden">
        <DialogHeader className="px-6">
          <DialogTitle className="text-lg font-semibold">Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="px-6">
          <div className="grid grid-cols-3 gap-8">
            {SHORTCUTS.map((category, index) => (
              <div
                key={category.title}
                className="flex flex-col gap-6 relative"
              >
                <h3 className="text-sm font-semibold">{category.title}</h3>
                <div className="flex flex-col gap-5">
                  {category.items.map((item) => (
                    <div
                      key={item.label}
                      className={cn(
                        "flex items-center justify-between text-sm",
                        item.disabled ? "opacity-40" : ""
                      )}
                    >
                      <span className="text-zinc-300">{item.label}</span>
                      <div className="flex gap-5">
                        {item.keys.map((key, i) => (
                          <Kbd
                            key={i}
                            className="bg-zinc-800 border-zinc-700 text-zinc-300 min-w-6"
                          >
                            {key}
                          </Kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {index < SHORTCUTS.length - 1 && (
                  <>
                    <div className="md:hidden">
                      <Separator className="my-4 bg-zinc-800" />
                    </div>
                    <div className="hidden md:block absolute -right-4 top-0 bottom-0 w-[1px] bg-zinc-800" />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
