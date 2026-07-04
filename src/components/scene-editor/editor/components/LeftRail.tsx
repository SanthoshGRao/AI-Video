import {
  Film,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Music,
  Settings,
  Subtitles,
  Type,
} from "lucide-react";
import { useEditorStore, type LeftPanel } from "../store";

const ITEMS: { key: LeftPanel; label: string; icon: typeof Film }[] = [
  { key: "media", label: "Media", icon: ImageIcon },
  { key: "library", label: "Library", icon: FolderOpen },
  { key: "text", label: "Text", icon: Type },
  { key: "subtitles", label: "Subtitles", icon: Subtitles },
  { key: "audio", label: "Audio", icon: Music },
  { key: "effects", label: "Effects", icon: Film },
  { key: "scenes", label: "Scenes", icon: Layers },
  { key: "settings", label: "Settings", icon: Settings },
];

export function LeftRail() {
  const active = useEditorStore((s) => s.leftPanel);
  const set = useEditorStore((s) => s.setLeftPanel);
  return (
    <nav className="flex w-16 flex-col items-center gap-1 border-r border-slate-200 bg-white py-3">
      {ITEMS.map((i) => {
        const Icon = i.icon;
        const isActive = active === i.key;
        return (
          <button
            key={i.key}
            onClick={() => set(i.key)}
            className={`group flex w-14 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-medium transition ${
              isActive
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon className="h-5 w-5" />
            {i.label}
          </button>
        );
      })}
    </nav>
  );
}
