"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Film,
  Loader2,
  Save,
  Sparkles,
  Wand2,
  Volume2,
  ImageIcon,
  Captions,
  Type,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/stores/ui-store";
import type {
  TimelineClip,
  TimelineDocument,
  TimelineRecord,
  TimelineTrack,
} from "@/lib/timeline/types";
import { cn } from "@/lib/utils";

const PX_PER_SEC = 48;

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const frac = Math.floor((ms % 1000) / 100);
  return `${m}:${sec.toString().padStart(2, "0")}.${frac}`;
}

const TRACK_ICONS: Record<string, typeof Film> = {
  video: Film,
  voiceover: Volume2,
  subtitle: Captions,
  text: Type,
  audio: Volume2,
};

type TimelineEditorPanelProps = {
  projectId: string;
  hasVoiceover: boolean;
  mediaCount: number;
};

function docFromRecord(t: TimelineRecord): TimelineDocument {
  return {
    tracks: t.tracks,
    clips: t.clips,
    transitions: t.transitions,
    textLayers: t.textLayers,
    settings: t.settings,
  };
}

export function TimelineEditorPanel({
  projectId,
  hasVoiceover,
  mediaCount,
}: TimelineEditorPanelProps) {
  const addToast = useUIStore((s) => s.addToast);
  const [record, setRecord] = useState<TimelineRecord | null>(null);
  const [doc, setDoc] = useState<TimelineDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/timeline`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load timeline");
    const t = json.timeline as TimelineRecord | null;
    setRecord(t);
    setDoc(t ? docFromRecord(t) : null);
    setDirty(false);
  }, [projectId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch {
        setRecord(null);
        setDoc(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const durationMs = doc?.settings.durationMs ?? 60_000;
  const timelineWidth = Math.max(320, (durationMs / 1000) * PX_PER_SEC);

  const selectedClip = useMemo(() => {
    if (!doc || !selectedClipId) return null;
    return doc.clips[selectedClipId] ?? null;
  }, [doc, selectedClipId]);

  const generateAi = async () => {
    setBusy("ai");
    try {
      const res = await fetch(
        `/api/projects/${projectId}/timeline/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replaceExisting: true }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI generation failed");
      const t = json.timeline as TimelineRecord;
      setRecord(t);
      setDoc(docFromRecord(t));
      setDirty(false);
      const meta = json.meta as { source?: string; sceneCount?: number };
      addToast({
        type: "success",
        title: "AI timeline ready",
        description:
          meta.source === "ai"
            ? `${meta.sceneCount ?? 0} scenes mapped to your script & media`
            : `${meta.sceneCount ?? 0} scenes (sentence-aligned fallback)`,
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "AI timeline failed",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  };

  const initTimeline = async (replace = false) => {
    setBusy("init");
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replaceExisting: replace }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Init failed");
      const t = json.timeline as TimelineRecord;
      setRecord(t);
      setDoc(docFromRecord(t));
      setDirty(false);
      addToast({
        type: "success",
        title: json.created ? "Timeline created" : "Timeline loaded",
        description: `${Object.keys(t.clips).length} clips on ${t.tracks.length} tracks`,
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "Could not create timeline",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!doc) return;
    setBusy("save");
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...doc,
          isAutosave: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      const t = json.timeline as TimelineRecord;
      setRecord(t);
      setDoc(docFromRecord(t));
      setDirty(false);
      addToast({ type: "success", title: "Timeline saved" });
    } catch (e) {
      addToast({
        type: "error",
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  };

  const updateClip = (clipId: string, patch: Partial<TimelineClip>) => {
    if (!doc) return;
    const prev = doc.clips[clipId];
    if (!prev) return;
    setDoc({
      ...doc,
      clips: {
        ...doc.clips,
        [clipId]: { ...prev, ...patch },
      },
    });
    setDirty(true);
  };

  const updateDuration = (ms: number) => {
    if (!doc || ms < 5000) return;
    setDoc({
      ...doc,
      settings: { ...doc.settings, durationMs: ms },
    });
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!!busy || !hasVoiceover || mediaCount === 0}
          onClick={() => void generateAi()}
        >
          {busy === "ai" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4" />
          )}
          Generate with AI
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!!busy}
          onClick={() => void initTimeline(!!doc)}
        >
          {busy === "init" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {doc ? "Quick rebuild" : "Quick create"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!!busy || !doc || !dirty}
          onClick={() => void save()}
        >
          {busy === "save" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save
        </Button>
        {record && (
          <Badge variant="secondary" className="normal-case tracking-normal">
            v{record.version}
            {record.isAiGenerated ? " · AI mapped" : " · manual"}
          </Badge>
        )}
        {dirty && (
          <Badge variant="warning" className="normal-case tracking-normal">
            Unsaved changes
          </Badge>
        )}
      </div>

      {!hasVoiceover && (
        <p className="text-sm text-amber-700">
          Add a voiceover in the Voice tab — the timeline uses its duration and
          places it on the voiceover track.
        </p>
      )}
      {mediaCount === 0 && (
        <p className="text-sm text-amber-700">
          Upload photos or videos in Media — they are split across the video
          track when you create the timeline.
        </p>
      )}

      {!doc ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Film className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No timeline yet</h3>
            <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
              Use Generate with AI to map script, voiceover,
              subtitles, and tagged media into scenes. Or quick-create an even
              split across clips.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                type="button"
                disabled={!!busy || !hasVoiceover || mediaCount === 0}
                onClick={() => void generateAi()}
              >
                <Wand2 className="w-4 h-4" />
                Generate with AI
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!!busy}
                onClick={() => void initTimeline(false)}
              >
                Quick create
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 items-end text-sm">
            <label className="space-y-1">
              <span className="text-slate-500">Duration (sec)</span>
              <Input
                type="number"
                className="w-28"
                min={5}
                value={Math.round(durationMs / 1000)}
                onChange={(e) =>
                  updateDuration(Math.round(Number(e.target.value) || 60) * 1000)
                }
              />
            </label>
            <span className="text-slate-500 pb-2">
              {doc.settings.width}×{doc.settings.height} · {doc.settings.fps}{" "}
              fps · {doc.settings.aspectRatio}
            </span>
          </div>

          <Card className="shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto border-b border-slate-100 bg-slate-50/80">
                <div
                  className="h-8 relative text-[10px] text-slate-400"
                  style={{ width: timelineWidth, minWidth: "100%" }}
                >
                  {Array.from({
                    length: Math.ceil(durationMs / 5000) + 1,
                  }).map((_, i) => (
                    <span
                      key={i}
                      className="absolute top-2 border-l border-slate-200 pl-1"
                      style={{ left: i * 5 * PX_PER_SEC }}
                    >
                      {formatClock(i * 5000)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {doc.tracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    doc={doc}
                    timelineWidth={timelineWidth}
                    durationMs={durationMs}
                    selectedClipId={selectedClipId}
                    onSelectClip={setSelectedClipId}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedClip && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-800">
                  Clip: {selectedClip.type}
                  {selectedClip.properties?.label
                    ? ` — ${String(selectedClip.properties.label)}`
                    : ""}
                </h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-xs space-y-1">
                    Start (sec)
                    <Input
                      type="number"
                      step="0.1"
                      value={(selectedClip.startTime / 1000).toFixed(2)}
                      onChange={(e) =>
                        updateClip(selectedClip.id, {
                          startTime: Math.round(
                            parseFloat(e.target.value) * 1000
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="text-xs space-y-1">
                    End (sec)
                    <Input
                      type="number"
                      step="0.1"
                      value={(selectedClip.endTime / 1000).toFixed(2)}
                      onChange={(e) =>
                        updateClip(selectedClip.id, {
                          endTime: Math.round(
                            parseFloat(e.target.value) * 1000
                          ),
                        })
                      }
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  {selectedClip.mediaAssetId && (
                    <>Media: {selectedClip.mediaAssetId.slice(0, 12)}… </>
                  )}
                  {selectedClip.audioAssetId && (
                    <>Audio: {selectedClip.audioAssetId.slice(0, 12)}… </>
                  )}
                  {selectedClip.subtitleTrackId && (
                    <>Subtitles linked</>
                  )}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function TrackRow({
  track,
  doc,
  timelineWidth,
  durationMs,
  selectedClipId,
  onSelectClip,
}: {
  track: TimelineTrack;
  doc: TimelineDocument;
  timelineWidth: number;
  durationMs: number;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
}) {
  const Icon = TRACK_ICONS[track.type] ?? ImageIcon;
  const clips = track.clipIds
    .map((id) => doc.clips[id])
    .filter(Boolean) as TimelineClip[];

  return (
    <div className="flex min-h-[52px]">
      <div className="w-36 shrink-0 flex items-center gap-2 px-3 py-2 border-r border-slate-100 bg-white">
        <Icon className="w-4 h-4 text-indigo-500 shrink-0" />
        <span className="text-xs font-medium text-slate-700 truncate">
          {track.name}
        </span>
        {track.locked && (
          <Lock className="w-3 h-3 text-slate-400 shrink-0" aria-hidden />
        )}
      </div>
      <div
        className="relative flex-1 bg-slate-50/50"
        style={{ width: timelineWidth, minWidth: 200 }}
      >
        {clips.map((clip) => {
          const left = (clip.startTime / 1000) * PX_PER_SEC;
          const width = Math.max(
            4,
            ((clip.endTime - clip.startTime) / 1000) * PX_PER_SEC
          );
          return (
            <button
              key={clip.id}
              type="button"
              className={cn(
                "absolute top-2 bottom-2 rounded-md border text-left px-2 py-1 text-[10px] font-medium truncate transition-shadow",
                track.type === "video" &&
                  "bg-indigo-100 border-indigo-300 text-indigo-900",
                track.type === "voiceover" &&
                  "bg-emerald-100 border-emerald-300 text-emerald-900",
                track.type === "subtitle" &&
                  "bg-violet-100 border-violet-300 text-violet-900",
                track.type === "text" &&
                  "bg-amber-100 border-amber-300 text-amber-900",
                selectedClipId === clip.id &&
                  "ring-2 ring-indigo-500 ring-offset-1"
              )}
              style={{ left, width }}
              title={`${formatClock(clip.startTime)} – ${formatClock(clip.endTime)}`}
              onClick={() => onSelectClip(clip.id)}
            >
              {clip.type === "image" || clip.type === "video"
                ? clip.type
                : (clip.properties?.label as string) ?? clip.type}
            </button>
          );
        })}
        <div
          className="absolute inset-y-0 right-0 w-px bg-slate-200 pointer-events-none"
          style={{ left: (durationMs / 1000) * PX_PER_SEC }}
        />
      </div>
    </div>
  );
}
