"use client";
import { useState, useCallback, useRef } from "react";
import { Search, Loader2, Music2, Play, Pause, Plus, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { generateId } from "@designcombo/timeline";
import { dispatch } from "@designcombo/events";
import { ADD_AUDIO } from "@designcombo/state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Built-in royalty-free sound effects
const BUILT_IN_SFX = [
  { id: "sfx-whoosh-1", name: "Whoosh", category: "Transitions", src: "https://cdn.pixabay.com/audio/2022/03/15/audio_c0c0f1f1b4.mp3" },
  { id: "sfx-swoosh-1", name: "Swoosh", category: "Transitions", src: "https://cdn.pixabay.com/audio/2022/03/24/audio_58e68c1f23.mp3" },
  { id: "sfx-pop-1", name: "Pop", category: "UI", src: "https://cdn.pixabay.com/audio/2022/03/10/audio_3b9d6b1e7a.mp3" },
  { id: "sfx-click-1", name: "Click", category: "UI", src: "https://cdn.pixabay.com/audio/2022/11/17/audio_408562ccc6.mp3" },
  { id: "sfx-notification-1", name: "Notification", category: "UI", src: "https://cdn.pixabay.com/audio/2024/02/19/audio_e4194b2da5.mp3" },
  { id: "sfx-success-1", name: "Success Chime", category: "UI", src: "https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3" },
  { id: "sfx-cinematic-1", name: "Cinematic Hit", category: "Cinematic", src: "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3" },
  { id: "sfx-impact-1", name: "Impact Boom", category: "Cinematic", src: "https://cdn.pixabay.com/audio/2022/10/30/audio_3e10151fa5.mp3" },
  { id: "sfx-tension-1", name: "Tension Rise", category: "Cinematic", src: "https://cdn.pixabay.com/audio/2022/02/07/audio_d0c9f1a8e4.mp3" },
  { id: "sfx-ding-1", name: "Ding Bell", category: "Misc", src: "https://cdn.pixabay.com/audio/2024/06/05/audio_3a4b5d5fa0.mp3" },
  { id: "sfx-typing-1", name: "Typing Keys", category: "Misc", src: "https://cdn.pixabay.com/audio/2022/03/19/audio_a5b0c1d3f4.mp3" },
  { id: "sfx-applause-1", name: "Applause", category: "Misc", src: "https://cdn.pixabay.com/audio/2021/08/09/audio_88e10a7a00.mp3" },
];

const SFX_CATEGORIES = ["All", "Transitions", "UI", "Cinematic", "Misc"];

const CATEGORY_COLORS: Record<string, string> = {
  Transitions: "bg-violet-100 text-violet-700",
  UI: "bg-sky-100 text-sky-700",
  Cinematic: "bg-rose-100 text-rose-700",
  Misc: "bg-slate-100 text-slate-600",
};

export function SFX() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredSfx = BUILT_IN_SFX.filter((sfx) => {
    const matchesCategory = activeCategory === "All" || sfx.category === activeCategory;
    const matchesSearch = !searchQuery.trim() ||
      sfx.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sfx.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleAddAudio = (sfx: typeof BUILT_IN_SFX[0]) => {
    dispatch(ADD_AUDIO, {
      payload: {
        id: generateId(),
        type: "audio",
        name: sfx.name,
        details: { src: sfx.src },
        metadata: { author: sfx.category },
      },
      options: {},
    });
  };

  const togglePlay = useCallback((sfxId: string, src: string) => {
    if (playingId === sfxId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(src);
    audio.volume = 0.5;
    audio.play().catch(() => { });
    audio.addEventListener("ended", () => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(sfxId);
  }, [playingId]);

  return (
    <div data-testid="panel-sfx" className="flex flex-1 flex-col max-w-full h-full bg-[#f8fafc]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          Sound Effects
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">Add sound effects to your video</p>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search effects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-white"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 pb-2">
        <div className="flex gap-1.5 flex-wrap">
          {SFX_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all",
                activeCategory === cat
                  ? "bg-violet-100 text-violet-700 ring-1 ring-violet-200"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* SFX list */}
      <ScrollArea className="flex-1 px-4">
        <div className="space-y-2 pb-4">
          {filteredSfx.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Music2 size={32} className="opacity-50" />
              <span className="text-sm">No effects found</span>
            </div>
          ) : (
            filteredSfx.map((sfx) => {
              const isPlaying = playingId === sfx.id;
              return (
                <div
                  key={sfx.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border p-3 transition-all",
                    isPlaying
                      ? "border-violet-200 bg-violet-50/60 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => togglePlay(sfx.id, sfx.src)}
                    className={cn(
                      "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all",
                      isPlaying
                        ? "bg-violet-500 text-white shadow-md"
                        : "bg-slate-100 text-slate-500 hover:bg-violet-100 hover:text-violet-600"
                    )}
                  >
                    {isPlaying ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 ml-0.5" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">{sfx.name}</div>
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 inline-block",
                      CATEGORY_COLORS[sfx.category] ?? "bg-slate-100 text-slate-600"
                    )}>
                      {sfx.category}
                    </span>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-shrink-0 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-violet-100 hover:text-violet-600"
                    onClick={() => handleAddAudio(sfx)}
                    title="Add to timeline"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
