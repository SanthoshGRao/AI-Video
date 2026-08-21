"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Download, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { speakerColor } from "./types";

export interface PreviewClip {
  index: number;
  speaker: string;
  text: string;
  audioBase64: string;
  mimeType: string;
  durationMs: number;
}

export interface CombinedAudio {
  audioBase64: string;
  mimeType: string;
  durationMs: number;
}

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface ClipMeta {
  /** Stage direction shown above the line (the "situation"). */
  direction?: string;
  /** Silence held before this line during playback. */
  pauseBeforeMs?: number;
}

export function ConversationPlayer({
  clips,
  combined,
  characters,
  meta,
  autoPlayKey,
}: {
  clips: PreviewClip[];
  combined: CombinedAudio | null;
  characters: string[];
  /** Per-clip narration + pause, aligned to `clips` by index. */
  meta?: ClipMeta[];
  /** Bump this (e.g. after a fresh generate) to auto-play from the top. */
  autoPlayKey?: number;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [holding, setHolding] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const urls = useMemo(
    () => clips.map((c) => `data:${c.mimeType};base64,${c.audioBase64}`),
    [clips]
  );
  const totalMs = useMemo(() => clips.reduce((sum, c) => sum + c.durationMs, 0), [clips]);

  const clearPauseTimer = () => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    clearPauseTimer();
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setHolding(false);
    setActiveIndex(-1);
  }, []);

  // Stop any playback if the clip set changes (re-preview) or on unmount.
  useEffect(() => {
    return () => {
      clearPauseTimer();
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [urls]);

  const playFrom = useCallback(
    (i: number) => {
      clearPauseTimer();
      audioRef.current?.pause();
      if (i < 0 || i >= urls.length) {
        setPlaying(false);
        setHolding(false);
        setActiveIndex(-1);
        return;
      }
      setActiveIndex(i);
      setPlaying(true);

      const start = () => {
        setHolding(false);
        const a = new Audio(urls[i]);
        audioRef.current = a;
        a.onended = () => playFrom(i + 1);
        a.onerror = () => playFrom(i + 1);
        a.play().catch(() => setPlaying(false));
      };

      // Honor the line's pause/beat/hold cue as real silence before it plays.
      const lead = i > 0 ? meta?.[i]?.pauseBeforeMs ?? 0 : 0;
      if (lead > 0) {
        setHolding(true);
        pauseTimerRef.current = setTimeout(start, lead);
      } else {
        start();
      }
    },
    [urls, meta]
  );

  const playSingle = useCallback(
    (i: number) => {
      clearPauseTimer();
      audioRef.current?.pause();
      setHolding(false);
      setActiveIndex(i);
      setPlaying(true);
      const a = new Audio(urls[i]);
      audioRef.current = a;
      a.onended = () => { setPlaying(false); setActiveIndex(-1); };
      a.onerror = () => { setPlaying(false); setActiveIndex(-1); };
      a.play().catch(() => setPlaying(false));
    },
    [urls]
  );

  // Auto-play from the top when the caller bumps autoPlayKey (fresh generate).
  // The originating click counts as the user gesture, so play() is allowed.
  useEffect(() => {
    if (autoPlayKey === undefined || autoPlayKey === 0) return;
    if (urls.length === 0) return;
    playFrom(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayKey]);

  const toggleAll = useCallback(() => {
    if (playing) {
      clearPauseTimer();
      audioRef.current?.pause();
      setPlaying(false);
      setHolding(false);
    } else if (activeIndex >= 0 && audioRef.current) {
      setPlaying(true);
      audioRef.current.play().catch(() => setPlaying(false));
    } else if (activeIndex >= 0) {
      // Paused mid-hold (no audio element yet) — restart this line.
      playFrom(activeIndex);
    } else {
      playFrom(0);
    }
  }, [playing, activeIndex, playFrom]);

  const download = useCallback(() => {
    if (!combined) return;
    const link = document.createElement("a");
    link.href = `data:${combined.mimeType};base64,${combined.audioBase64}`;
    link.download = `skit-conversation-${Math.round(combined.durationMs / 1000)}s.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [combined]);

  const colorFor = (speaker: string) => speakerColor(Math.max(0, characters.indexOf(speaker)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 flex-wrap">
        <Button
          type="button"
          onClick={toggleAll}
          className="h-9 px-4 gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm shadow-slate-900/20 transition-all"
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {playing ? "Pause" : activeIndex >= 0 ? "Resume" : "Play conversation"}
        </Button>
        {(playing || activeIndex >= 0) && (
          <Button
            type="button"
            variant="outline"
            onClick={stop}
            className="h-9 px-3.5 gap-1.5 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs shadow-2xs"
          >
            <Square className="w-3.5 h-3.5 text-slate-500" />
            Stop
          </Button>
        )}
        {combined && (
          <Button
            type="button"
            onClick={download}
            className="h-9 px-3.5 gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-800 font-semibold text-xs transition-all shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            Download
          </Button>
        )}
        <span className="text-xs text-slate-400 tabular-nums ml-auto">
          {clips.length} lines · {fmt(totalMs)}
        </span>
      </div>

      <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {clips.map((clip, i) => {
          const color = colorFor(clip.speaker);
          const active = i === activeIndex;
          const m = meta?.[i];
          const pauseSec = m?.pauseBeforeMs ? Math.round(m.pauseBeforeMs / 100) / 10 : 0;
          return (
            <li key={clip.index} className="space-y-1">
              {m?.direction && (
                <p className="flex items-start gap-1.5 text-[11px] italic text-slate-400 px-1">
                  <Clapperboard className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{m.direction}</span>
                </p>
              )}
              {pauseSec > 0 && (
                <p className="px-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
                  <span className={cn("inline-block h-px w-5 transition-colors", holding && active ? "bg-indigo-400" : "bg-slate-300")} />
                  {holding && active ? "holding…" : `beat · ${pauseSec}s`}
                </p>
              )}
              <button
                type="button"
                onClick={() => playSingle(i)}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 group",
                  active ? cn(color.active, "shadow-sm") : "border-slate-100 hover:bg-slate-50"
                )}
              >
                <span className={cn("mt-1.5 w-2.5 h-2.5 rounded-full shrink-0", color.dot)} />
                <span className="flex-1 min-w-0">
                  <span className={cn("inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border mb-1", color.chip)}>
                    {clip.speaker}
                  </span>
                  <span className="block text-sm text-slate-800 leading-snug">{clip.text}</span>
                </span>
                <span className="shrink-0 mt-0.5 text-slate-300 group-hover:text-indigo-500 transition-colors">
                  {active && playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
