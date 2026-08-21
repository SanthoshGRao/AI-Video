"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import { Loader2, Pause, Play, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SentenceTimestamp } from "@/lib/tts/types";
import { cn } from "@/lib/utils";

export type WaveformPlayerHandle = {
  seekTo: (seconds: number) => void;
  playPause: () => void;
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type WaveformPlayerProps = {
  audioUrl: string;
  durationMs: number;
  waveformData?: number[] | null;
  projectId: string;
  audioId: string;
  sentences?: SentenceTimestamp[];
  onTimeUpdate?: (seconds: number) => void;
};

export const WaveformPlayer = forwardRef<
  WaveformPlayerHandle,
  WaveformPlayerProps
>(function WaveformPlayer(
  {
    audioUrl,
    durationMs,
    waveformData,
    projectId,
    audioId,
    sentences = [],
    onTimeUpdate,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<import("wavesurfer.js").default | null>(null);
  const regionsRef = useRef<import("wavesurfer.js/plugins/regions").default | null>(
    null
  );
  const savedPeaksRef = useRef(!!waveformData?.length);

  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const durationSec = durationMs / 1000;

  const persistPeaks = useCallback(
    async (peaks: number[]) => {
      if (savedPeaksRef.current) return;
      savedPeaksRef.current = true;
      try {
        await fetch(`/api/projects/${projectId}/audio/${audioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waveformData: peaks }),
        });
      } catch {
        savedPeaksRef.current = false;
      }
    },
    [projectId, audioId]
  );

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      wsRef.current?.setTime(seconds);
      void wsRef.current?.play();
    },
    playPause: () => {
      void wsRef.current?.playPause();
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const WaveSurfer = (await import("wavesurfer.js")).default;
        const RegionsPlugin = (
          await import("wavesurfer.js/plugins/regions")
        ).default;

        if (cancelled) return;

        const regions = RegionsPlugin.create();
        const ws = WaveSurfer.create({
          container,
          height: 100,
          waveColor: "#c7d2fe",
          progressColor: "#6366f1",
          cursorColor: "#312e81",
          cursorWidth: 2,
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          dragToSeek: true,
          normalize: true,
          plugins: [regions],
        });

        ws.on("timeupdate", (t) => {
          setCurrentTime(t);
          onTimeUpdate?.(t);
        });
        ws.on("play", () => setPlaying(true));
        ws.on("pause", () => setPlaying(false));

        regions.on("region-clicked", (region, e) => {
          e.stopPropagation();
          ws.setTime(region.start);
          void ws.play();
        });

        ws.on("ready", () => {
          if (cancelled) return;
          setLoading(false);

          if (!waveformData?.length) {
            const peaks = ws.exportPeaks({ channels: 1, maxLength: 256 });
            if (peaks[0]?.length) void persistPeaks(peaks[0]);
          }
        });

        regionsRef.current = regions;

        ws.on("error", () => {
          if (!cancelled) setError("Could not load waveform");
          setLoading(false);
        });

        if (waveformData?.length && durationSec > 0) {
          await ws.load(audioUrl, [waveformData], durationSec);
        } else {
          await ws.load(audioUrl);
        }

        wsRef.current = ws;
      } catch {
        if (!cancelled) {
          setError("Waveform failed to initialize");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      wsRef.current?.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, [audioUrl, audioId, durationSec, waveformData, onTimeUpdate, persistPeaks]);

  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws || loading) return;

    regions.clearRegions();
    sentences.forEach((s, i) => {
      regions.addRegion({
        id: `sentence-${i}`,
        start: s.start,
        end: s.end,
        color: "rgba(99, 102, 241, 0.12)",
        drag: false,
        resize: false,
      });
    });
  }, [sentences, loading]);

  const activeSentenceIndex = sentences.findIndex(
    (s) => currentTime >= s.start && currentTime < s.end
  );

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        )}
        <div ref={containerRef} className="w-full min-h-[100px]" />
      </div>

      {error && (
        <p className="text-xs text-amber-700">{error} — use controls below.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void wsRef.current?.playPause()}
          disabled={loading}
        >
          {playing ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => wsRef.current?.setTime(0)}
          disabled={loading}
        >
          <SkipBack className="w-4 h-4" />
        </Button>
        <span className="text-xs text-slate-500 tabular-nums">
          {formatTime(currentTime)} / {formatTime(durationSec || 0)}
        </span>
        {waveformData?.length ? (
          <span className="text-[10px] text-slate-400">Cached waveform</span>
        ) : (
          <span className="text-[10px] text-slate-400">Building waveform…</span>
        )}
      </div>

      {sentences.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sentences.map((s, i) => (
            <button
              key={i}
              type="button"
              title={s.text}
              onClick={() => {
                wsRef.current?.setTime(s.start);
                void wsRef.current?.play();
              }}
              className={cn(
                "text-[10px] px-2 py-1 rounded-md border transition-colors max-w-[120px] truncate",
                i === activeSentenceIndex
                  ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              {formatTime(s.start)} · S{i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
