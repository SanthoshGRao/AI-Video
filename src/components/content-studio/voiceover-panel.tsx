"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Download, Loader2, Mic, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WaveformPlayer, type WaveformPlayerHandle } from "@/components/content-studio/waveform-player";
import { parseAudioSync } from "@/lib/tts/types";
import { GEMINI_VOICES, TTS_LANGUAGES } from "@/lib/tts/voices";
import { cn } from "@/lib/utils";

type AudioAssetLike = {
  id: string;
  projectId?: string;
  r2Url: string;
  voiceType: string;
  durationMs: number;
  waveformData?: number[] | null;
  wordTimestamps: unknown;
};

export function VoiceoverPanel({
  audio,
  projectId,
  selectedScriptId,
  busy,
  onGenerate,
}: {
  audio: AudioAssetLike | null | undefined;
  projectId: string;
  selectedScriptId: string | null;
  busy: boolean;
  onGenerate: (voicePersona: string, languageCode: string) => Promise<void>;
}) {
  const [voicePersona, setVoicePersona] = useState("Charon");
  const [languageCode, setLanguageCode] = useState("kn-IN");
  const [currentTime, setCurrentTime] = useState(0);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");

  const waveformRef = useRef<WaveformPlayerHandle>(null);

  const sync = audio ? parseAudioSync(audio.wordTimestamps) : null;
  const waveformPeaks =
    Array.isArray(audio?.waveformData) &&
      audio.waveformData.every((n) => typeof n === "number")
      ? (audio.waveformData as number[])
      : null;

  const activeSentenceIndex = sync?.sentences.findIndex(
    (s) => currentTime >= s.start && currentTime < s.end
  ) ?? -1;

  // Auto-scroll removed per user request
  const activeSentenceRef = useRef<number>(-1);
  useEffect(() => {
    if (activeSentenceIndex !== -1 && activeSentenceIndex !== activeSentenceRef.current) {
      activeSentenceRef.current = activeSentenceIndex;
    }
  }, [activeSentenceIndex]);

  const seekTo = useCallback((sec: number) => {
    waveformRef.current?.seekTo(sec);
  }, []);

  const filteredVoices = GEMINI_VOICES.filter((voice) => {
    const matchesSearch =
      voice.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voice.tone.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGender = genderFilter === "all" || voice.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  const selectedVoiceInfo = GEMINI_VOICES.find((v) => v.name === voicePersona) || GEMINI_VOICES[0];

  const handleDownload = useCallback(async () => {
    if (!audio?.r2Url) return;
    try {
      const response = await fetch(audio.r2Url);
      const blob = await response.blob();
      const ext = audio.r2Url.includes(".wav") ? "wav" : "mp3";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `voiceover-${audio.voiceType.replace(/\s+/g, "-").toLowerCase()}-${Math.round(audio.durationMs / 1000)}s.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(audio.r2Url, "_blank");
    }
  }, [audio]);

  if (!audio) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-8 max-w-md mx-auto text-center space-y-6">
          <Mic className="w-12 h-12 text-indigo-500 mx-auto" />
          <h3 className="text-lg font-semibold">Generate voiceover</h3>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-xs font-semibold text-slate-600">Language</label>
              <Select value={languageCode} onValueChange={setLanguageCode}>
                <SelectTrigger className="w-full p-3 h-11 rounded-xl border border-slate-200 bg-white text-sm justify-between">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {TTS_LANGUAGES.map((language) => (
                    <SelectItem key={language.code} value={language.code}>
                      {language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-xs font-semibold text-slate-600">Narrator Voice</label>
              <button
                type="button"
                onClick={() => setVoiceDialogOpen(true)}
                className="w-full p-3 h-11 rounded-xl border border-slate-200 bg-white text-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-indigo-500" />
                  <span className="font-semibold text-slate-800">{voicePersona}</span>
                  <span className="text-xs text-slate-500">
                    ({selectedVoiceInfo.gender === "male" ? "Male" : "Female"})
                  </span>
                </div>
                <span className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Change</span>
              </button>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={busy || !selectedScriptId}
            onClick={() => void onGenerate(voicePersona, languageCode)}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Generate voiceover"
            )}
          </Button>
          {!selectedScriptId && (
            <p className="text-xs text-amber-600">
              Select a script in the Scripts tab first.
            </p>
          )}
        </CardContent>

        <Dialog open={voiceDialogOpen} onOpenChange={setVoiceDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 gap-4 bg-white z-[100]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Mic className="w-5 h-5 text-indigo-500" />
                AI Voice Studio
              </DialogTitle>
              <DialogDescription className="sr-only">
                Select a voice.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search voices by name or tone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-1 border border-slate-100 rounded-lg p-1 bg-slate-50/50 text-xs w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setGenderFilter("all")}
                  className={cn(
                    "flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-colors font-medium",
                    genderFilter === "all" ? "bg-white shadow-xs text-slate-900" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setGenderFilter("male")}
                  className={cn(
                    "flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-colors font-medium",
                    genderFilter === "male" ? "bg-white shadow-xs text-slate-900" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  ♂ Male
                </button>
                <button
                  type="button"
                  onClick={() => setGenderFilter("female")}
                  className={cn(
                    "flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-colors font-medium",
                    genderFilter === "female" ? "bg-white shadow-xs text-slate-900" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  ♀ Female
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 pr-1 max-h-[50vh]">
              {filteredVoices.map((voice) => {
                const isSelected = voicePersona === voice.name;
                return (
                  <button
                    key={voice.name}
                    type="button"
                    onClick={() => {
                      setVoicePersona(voice.name);
                      setVoiceDialogOpen(false);
                    }}
                    className={cn(
                      "text-left p-3.5 rounded-xl border-2 transition-all flex flex-col gap-1.5 group",
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/40"
                        : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {voice.name}
                      </span>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide",
                        voice.gender === "male"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-rose-50 text-rose-700"
                      )}>
                        {voice.gender}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 italic">
                      {voice.tone}
                    </span>
                  </button>
                );
              })}
              {filteredVoices.length === 0 && (
                <div className="col-span-full py-8 text-center text-slate-400 text-sm">
                  No voices found matching "{searchQuery}"
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  const activeWordIndex =
    sync?.words.findIndex(
      (w) => currentTime >= w.start && currentTime < w.end
    ) ?? -1;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Card className="shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Voiceover ready</h3>
              <p className="text-sm text-slate-500">
                {audio.voiceType} · {Math.round(audio.durationMs / 1000)}s
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="h-8 gap-1.5 text-slate-600 hover:text-slate-900"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </Button>
          </div>

          <WaveformPlayer
            ref={waveformRef}
            audioUrl={audio.r2Url}
            durationMs={audio.durationMs}
            waveformData={waveformPeaks}
            projectId={projectId}
            audioId={audio.id}
            sentences={sync?.sentences}
            onTimeUpdate={setCurrentTime}
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] flex flex-col gap-1 text-left">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Language</label>
              <Select value={languageCode} onValueChange={setLanguageCode}>
                <SelectTrigger className="w-full p-2.5 h-10 rounded-lg border border-slate-200 bg-white text-sm justify-between">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {TTS_LANGUAGES.map((language) => (
                    <SelectItem key={language.code} value={language.code}>
                      {language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px] flex flex-col gap-1 text-left">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Narrator Voice</label>
              <button
                type="button"
                onClick={() => setVoiceDialogOpen(true)}
                className="w-full p-2.5 h-10 rounded-lg border border-slate-200 bg-white text-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="font-semibold text-slate-800">{voicePersona}</span>
                  <span className="text-xs text-slate-400">
                    ({selectedVoiceInfo.gender === "male" ? "Male" : "Female"})
                  </span>
                </div>
                <span className="text-xs text-indigo-600 font-medium">Change</span>
              </button>
            </div>

            <div>
              <Button
                variant="secondary"
                disabled={busy || !selectedScriptId}
                onClick={() => void onGenerate(voicePersona, languageCode)}
                className="h-10"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Regenerate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {sync && sync.words.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-4">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              Word sync ({sync.words.length} words)
            </h4>

            <p className="text-sm leading-loose">
              {sync.words.map((w, i) => (
                <button
                  key={`${w.word}-${i}`}
                  type="button"
                  onClick={() => seekTo(w.start)}
                  className={cn(
                    "inline mr-1 px-0.5 rounded transition-colors",
                    i === activeWordIndex
                      ? "bg-indigo-200 text-indigo-900"
                      : "hover:bg-slate-100 text-slate-800"
                  )}
                >
                  {w.word}
                </button>
              ))}
            </p>
          </CardContent>
        </Card>
      )}

      {sync && sync.sentences.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">
              Sentences ({sync.sentences.length})
            </h4>

            <ul id="sentences-container" className="space-y-2 max-h-64 overflow-y-auto relative">
              {sync.sentences.map((s, i) => {
                const active = i === activeSentenceIndex;
                return (
                  <li key={i} id={`sentence-${i}`}>
                    <button
                      type="button"
                      onClick={() => seekTo(s.start)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border text-sm transition-colors",
                        active
                          ? "border-indigo-200 bg-indigo-50"
                          : "border-slate-100 hover:bg-slate-50"
                      )}
                    >
                      <span className="text-[10px] text-slate-400 tabular-nums block mb-1">
                        {s.start.toFixed(1)}s – {s.end.toFixed(1)}s
                      </span>
                      {s.text}
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={voiceDialogOpen} onOpenChange={setVoiceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 gap-4 bg-white z-[100]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Mic className="w-5 h-5 text-indigo-500" />
              AI Voice Studio
            </DialogTitle>
            <DialogDescription className="sr-only">
              Select a voice.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search voices by name or tone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex gap-1 border border-slate-100 rounded-lg p-1 bg-slate-50/50 text-xs w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setGenderFilter("all")}
                className={cn(
                  "flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-colors font-medium",
                  genderFilter === "all" ? "bg-white shadow-xs text-slate-900" : "text-slate-500 hover:text-slate-800"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setGenderFilter("male")}
                className={cn(
                  "flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-colors font-medium",
                  genderFilter === "male" ? "bg-white shadow-xs text-slate-900" : "text-slate-500 hover:text-slate-800"
                )}
              >
                ♂ Male
              </button>
              <button
                type="button"
                onClick={() => setGenderFilter("female")}
                className={cn(
                  "flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-colors font-medium",
                  genderFilter === "female" ? "bg-white shadow-xs text-slate-900" : "text-slate-500 hover:text-slate-800"
                )}
              >
                ♀ Female
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 pr-1 max-h-[50vh]">
            {filteredVoices.map((voice) => {
              const isSelected = voicePersona === voice.name;
              return (
                <button
                  key={voice.name}
                  type="button"
                  onClick={() => {
                    setVoicePersona(voice.name);
                    setVoiceDialogOpen(false);
                  }}
                  className={cn(
                    "text-left p-3.5 rounded-xl border-2 transition-all flex flex-col gap-1.5 group",
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/40"
                      : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {voice.name}
                    </span>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide",
                      voice.gender === "male"
                        ? "bg-sky-50 text-sky-700"
                        : "bg-rose-50 text-rose-700"
                    )}>
                      {voice.gender}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 italic">
                    {voice.tone}
                  </span>
                </button>
              );
            })}
            {filteredVoices.length === 0 && (
              <div className="col-span-full py-8 text-center text-slate-400 text-sm">
                No voices found matching "{searchQuery}"
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
