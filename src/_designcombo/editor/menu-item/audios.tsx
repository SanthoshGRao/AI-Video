import Draggable from "@/_designcombo/shared/draggable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { dispatch } from "@designcombo/events";
import { ADD_AUDIO } from "@designcombo/state";
import { IAudio } from "@designcombo/types";
import { Music, Music2, Play, Pause, Plus, Search, Volume2 } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { generateId } from "@designcombo/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Built-in royalty-free background music from Pixabay
const BUILT_IN_TRACKS = [
  {
    id: "bg-corporate-1",
    name: "Corporate Upbeat",
    category: "Corporate",
    duration: "2:15",
    src: "https://cdn.pixabay.com/audio/2024/11/28/audio_3a38573e43.mp3",
  },
  {
    id: "bg-ambient-1",
    name: "Ambient Piano",
    category: "Ambient",
    duration: "2:30",
    src: "https://cdn.pixabay.com/audio/2024/09/10/audio_6e1d7b3a62.mp3",
  },
  {
    id: "bg-cinematic-1",
    name: "Cinematic Inspiration",
    category: "Cinematic",
    duration: "2:10",
    src: "https://cdn.pixabay.com/audio/2024/10/07/audio_7da1e3c1f4.mp3",
  },
  {
    id: "bg-upbeat-1",
    name: "Happy & Bright",
    category: "Upbeat",
    duration: "1:45",
    src: "https://cdn.pixabay.com/audio/2024/09/20/audio_fb75ee4a77.mp3",
  },
  {
    id: "bg-chill-1",
    name: "Lo-Fi Chill",
    category: "Chill",
    duration: "2:00",
    src: "https://cdn.pixabay.com/audio/2024/04/16/audio_3d2e2c15ba.mp3",
  },
  {
    id: "bg-electronic-1",
    name: "Electronic Drive",
    category: "Electronic",
    duration: "2:20",
    src: "https://cdn.pixabay.com/audio/2024/08/19/audio_5c74b3e6f9.mp3",
  },
  {
    id: "bg-acoustic-1",
    name: "Acoustic Feel Good",
    category: "Acoustic",
    duration: "1:55",
    src: "https://cdn.pixabay.com/audio/2024/07/12/audio_5f1e9caae2.mp3",
  },
  {
    id: "bg-motivational-1",
    name: "Motivational Epic",
    category: "Cinematic",
    duration: "2:45",
    src: "https://cdn.pixabay.com/audio/2024/06/03/audio_a5c1e8d932.mp3",
  },
  {
    id: "bg-jazz-1",
    name: "Smooth Jazz",
    category: "Jazz",
    duration: "2:10",
    src: "https://cdn.pixabay.com/audio/2024/05/15/audio_b2c3d4e5f6.mp3",
  },
  {
    id: "bg-nature-1",
    name: "Nature Ambience",
    category: "Ambient",
    duration: "3:00",
    src: "https://cdn.pixabay.com/audio/2024/03/22/audio_a1b2c3d4e5.mp3",
  },
];

const CATEGORIES = ["All", "Corporate", "Ambient", "Cinematic", "Upbeat", "Chill", "Electronic", "Acoustic", "Jazz"];

const CATEGORY_COLORS: Record<string, string> = {
  Corporate: "bg-blue-100 text-blue-700",
  Ambient: "bg-emerald-100 text-emerald-700",
  Cinematic: "bg-purple-100 text-purple-700",
  Upbeat: "bg-amber-100 text-amber-700",
  Chill: "bg-teal-100 text-teal-700",
  Electronic: "bg-pink-100 text-pink-700",
  Acoustic: "bg-orange-100 text-orange-700",
  Jazz: "bg-indigo-100 text-indigo-700",
};

export const Audios = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredTracks = BUILT_IN_TRACKS.filter((track) => {
    const matchesCategory = activeCategory === "All" || track.category === activeCategory;
    const matchesSearch = !searchQuery.trim() ||
      track.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleAddAudio = (track: typeof BUILT_IN_TRACKS[0]) => {
    dispatch(ADD_AUDIO, {
      payload: {
        id: generateId(),
        type: "audio",
        name: track.name,
        details: {
          src: track.src,
        },
        metadata: {
          author: track.category,
        },
      },
      options: {},
    });
  };

  const togglePlay = useCallback((trackId: string, src: string) => {
    if (playingId === trackId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(src);
    audio.volume = 0.5;
    audio.play().catch(() => {});
    audio.addEventListener("ended", () => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(trackId);
  }, [playingId]);

  return (
    <div data-testid="panel-audio" className="flex flex-1 flex-col max-w-full h-full bg-[#f8fafc]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-indigo-500" />
          Background Music
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">Royalty-free tracks for your videos</p>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search tracks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-white"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 pb-2">
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all",
                activeCategory === cat
                  ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Track list */}
      <ScrollArea className="flex-1 px-4">
        <div className="space-y-2 pb-4">
          {filteredTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Music2 size={32} className="opacity-50" />
              <span className="text-sm">No tracks found</span>
            </div>
          ) : (
            filteredTracks.map((track) => {
              const isPlaying = playingId === track.id;
              return (
                <div
                  key={track.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border p-3 transition-all",
                    isPlaying
                      ? "border-indigo-200 bg-indigo-50/60 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  )}
                >
                  {/* Play button */}
                  <button
                    type="button"
                    onClick={() => togglePlay(track.id, track.src)}
                    className={cn(
                      "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all",
                      isPlaying
                        ? "bg-indigo-500 text-white shadow-md"
                        : "bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600"
                    )}
                  >
                    {isPlaying ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 ml-0.5" />
                    )}
                  </button>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {track.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        CATEGORY_COLORS[track.category] ?? "bg-slate-100 text-slate-600"
                      )}>
                        {track.category}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">{track.duration}</span>
                    </div>
                  </div>

                  {/* Add button */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-shrink-0 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-100 hover:text-indigo-600"
                    onClick={() => handleAddAudio(track)}
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
};
