import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEditorStore } from "../store";
import { fmtTime } from "../utils";

export function TransportBar() {
  const playing = useEditorStore((s) => s.playing);
  const toggle = useEditorStore((s) => s.togglePlay);
  const seek = useEditorStore((s) => s.seek);
  const t = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.timeline?.duration ?? 0);
  const muted = useEditorStore((s) => s.muted);
  const setMuted = useEditorStore((s) => s.setMuted);
  const volume = useEditorStore((s) => s.volume);
  const setVolume = useEditorStore((s) => s.setVolume);

  return (
    <div className="flex h-11 items-center gap-3 border-t border-slate-200 bg-white px-4">
      <div className="flex items-center gap-1">
        <button onClick={() => seek(0)} className="rounded p-1.5 hover:bg-slate-100">
          <SkipBack className="h-4 w-4 text-slate-700" />
        </button>
        <button
          onClick={toggle}
          className="rounded-full bg-slate-900 p-2 text-white hover:bg-slate-700"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button onClick={() => seek(duration)} className="rounded p-1.5 hover:bg-slate-100">
          <SkipForward className="h-4 w-4 text-slate-700" />
        </button>
      </div>
      <div className="font-mono text-xs tabular-nums text-slate-600">
        {fmtTime(t)} <span className="text-slate-300">/</span> {fmtTime(duration)}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => setMuted(!muted)} className="rounded p-1 hover:bg-slate-100">
          {muted ? <VolumeX className="h-4 w-4 text-slate-600" /> : <Volume2 className="h-4 w-4 text-slate-600" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-24 accent-indigo-600"
        />
      </div>
    </div>
  );
}
