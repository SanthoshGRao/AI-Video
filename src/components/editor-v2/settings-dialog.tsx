"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon } from "lucide-react";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { settings, setSetting, autosave, toggleAutosave } = useEditor();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] p-0 overflow-hidden bg-[#1a1a20]/80 backdrop-blur-2xl border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-xl sm:rounded-xl">
        <DialogHeader className="px-6 py-4 border-b border-white/10 bg-white/[0.02] m-0">
          <DialogTitle className="flex items-center gap-2.5 text-base font-semibold text-zinc-100">
            <div className="p-1.5 rounded-lg bg-brand/20 text-brand-light ring-1 ring-white/10 shadow-sm">
              <SettingsIcon className="size-4" />
            </div>
            Editor Settings
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-6 space-y-5">
          <div className="space-y-4">
            <Row label="Frame rate" hint="Playback & export FPS">
              <Select value={String(settings.fps)} onValueChange={(v) => setSetting("fps", Number(v) as 24 | 30 | 60)}>
                <SelectTrigger className="w-[100px] h-8 bg-black/30 hover:bg-black/40 border-white/10 text-zinc-200 shadow-inner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a20] border-white/10 text-zinc-200 z-[150] dark">
                  <SelectItem value="24" className="text-zinc-200 focus:bg-white/10 focus:text-white cursor-pointer">24 fps</SelectItem>
                  <SelectItem value="30" className="text-zinc-200 focus:bg-white/10 focus:text-white cursor-pointer">30 fps</SelectItem>
                  <SelectItem value="60" className="text-zinc-200 focus:bg-white/10 focus:text-white cursor-pointer">60 fps</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Default resolution" hint="Used for new exports">
              <Select value={settings.resolution} onValueChange={(v) => setSetting("resolution", v as typeof settings.resolution)}>
                <SelectTrigger className="w-[100px] h-8 bg-black/30 hover:bg-black/40 border-white/10 text-zinc-200 shadow-inner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a20] border-white/10 text-zinc-200 z-[150] dark">
                  <SelectItem value="720" className="text-zinc-200 focus:bg-white/10 focus:text-white cursor-pointer">720p</SelectItem>
                  <SelectItem value="1080" className="text-zinc-200 focus:bg-white/10 focus:text-white cursor-pointer">1080p</SelectItem>
                  <SelectItem value="1440" className="text-zinc-200 focus:bg-white/10 focus:text-white cursor-pointer">1440p</SelectItem>
                  <SelectItem value="4k" className="text-zinc-200 focus:bg-white/10 focus:text-white cursor-pointer">4K</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </div>

          <div className="h-px bg-white/5 w-full my-1 rounded-full" />

          <div className="space-y-4">
            <ToggleRow label="Autosave" hint="Save changes automatically" checked={autosave} onChange={toggleAutosave} />
            <ToggleRow label="Snap to grid" hint="Align clips while dragging" checked={settings.snapping} onChange={(v) => setSetting("snapping", v)} />
            <ToggleRow label="Show guides" hint="Alignment guides on canvas" checked={settings.showGuides} onChange={(v) => setSetting("showGuides", v)} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between group">
      <div>
        <p className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors">{label}</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between group">
      <div>
        <p className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors">{label}</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-brand data-[state=unchecked]:bg-zinc-600/50" />
    </div>
  );
}
