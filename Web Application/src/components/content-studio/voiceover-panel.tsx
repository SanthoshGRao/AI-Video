"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Download, Loader2, Mic, Pencil, RefreshCw, Save, Search, Trash2, Volume2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { WaveformPlayer, type WaveformPlayerHandle } from "@/components/content-studio/waveform-player";
import { parseAudioSync } from "@/lib/tts/types";
import {
  GEMINI_VOICES,
  STYLE_PRESETS,
  TTS_LANGUAGES,
  createGeminiVoicePersona,
  findStylePreset,
  resolveSpeakingInstructions,
} from "@/lib/tts/voices";
import { cn } from "@/lib/utils";

type AudioAssetLike = {
  id: string;
  projectId?: string;
  r2Url: string;
  voiceType: string;
  voiceStyleLabel?: string | null;
  durationMs: number;
  waveformData?: number[] | null;
  wordTimestamps: unknown;
};

type VoiceStylePresetLike = {
  id: string;
  name: string;
  geminiVoice: string;
  languageCode: string;
  styleId?: string | null;
  styleInstructions: string;
};

const STYLE_CARD_BASE =
  "relative text-left p-3.5 rounded-xl border transition-all flex flex-col gap-1 min-h-[72px]";
const STYLE_CARD_ACTIVE = "border-indigo-500 bg-indigo-50/50 shadow-sm shadow-indigo-100";
const STYLE_CARD_IDLE = "border-slate-200 hover:border-indigo-200 hover:bg-slate-50/80";

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
  onGenerate: (
    voicePersona: string,
    languageCode: string,
    styleId?: string,
    customInstructions?: string
  ) => Promise<void>;
}) {
  const parseVoiceType = useCallback((voiceType: string | undefined) => {
    if (!voiceType) return null;
    const [namePart, languageLabelPart] = voiceType.split(" - ").map((s) => s.trim());
    const voice = GEMINI_VOICES.find((v) => v.name === namePart);
    if (!voice) return null;
    const language = TTS_LANGUAGES.find((l) => l.label === languageLabelPart);
    return { name: voice.name, languageCode: language?.code };
  }, []);

  const initialVoice = parseVoiceType(audio?.voiceType);
  const [voicePersona, setVoicePersona] = useState<string>(initialVoice?.name ?? "Charon");
  const [languageCode, setLanguageCode] = useState<string>(initialVoice?.languageCode ?? "kn-IN");

  // Re-sync the persona/language pickers whenever the active audio asset changes
  // (initial async load, or switching scripts) so they reflect what was actually generated.
  useEffect(() => {
    const parsed = parseVoiceType(audio?.voiceType);
    if (parsed) {
      setVoicePersona(parsed.name);
      if (parsed.languageCode) setLanguageCode(parsed.languageCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio?.id, audio?.voiceType]);

  const [currentTime, setCurrentTime] = useState(0);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<"voice" | "style">("voice");
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");

  // Delivery style: a built-in preset id, fully custom director's-notes text, or
  // neither (falls back to the voice's own default persona instructions server-side).
  const [styleId, setStyleId] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const isCustomActive = customInstructions.trim().length > 0;
  // Tracks which saved preset (if any) the current custom instructions came from,
  // purely for display in the "Style" summary — cleared as soon as the text is edited.
  const [appliedPresetName, setAppliedPresetName] = useState<string | null>(null);

  const [presets, setPresets] = useState<VoiceStylePresetLike[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/voice-presets")
      .then((res) => (res.ok ? res.json() : { presets: [] }))
      .then((data) => setPresets(Array.isArray(data.presets) ? data.presets : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
    };
  }, []);

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
  const currentStyleLabel =
    appliedPresetName ?? (isCustomActive ? "Custom" : findStylePreset(styleId)?.label ?? "Voice Default");

  const handleSelectStyle = useCallback((id: string | null) => {
    setStyleId(id);
    setCustomInstructions("");
    setAppliedPresetName(null);
  }, []);

  const handleCustomInstructionsChange = useCallback((value: string) => {
    setCustomInstructions(value);
    setAppliedPresetName(null);
  }, []);

  const handleApplyPreset = useCallback((preset: VoiceStylePresetLike) => {
    setVoicePersona(preset.geminiVoice);
    setLanguageCode(preset.languageCode);
    setStyleId(null);
    setCustomInstructions(preset.styleInstructions);
    setAppliedPresetName(preset.name);
  }, []);

  const handleDeletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    void fetch(`/api/voice-presets/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const openRenamePreset = useCallback((preset: VoiceStylePresetLike) => {
    setEditingPresetId(preset.id);
    setSaveName(preset.name);
    setSaveDialogOpen(true);
  }, []);

  const handlePreview = useCallback(async () => {
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const trimmed = customInstructions.trim();
      const res = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceName: voicePersona,
          languageCode,
          styleId: trimmed ? undefined : styleId ?? undefined,
          customInstructions: trimmed || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Preview failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      previewAudioRef.current?.pause();
      const audioEl = new Audio(url);
      audioEl.addEventListener("ended", () => URL.revokeObjectURL(url));
      previewAudioRef.current = audioEl;
      await audioEl.play();
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }, [voicePersona, languageCode, styleId, customInstructions]);

  const handleSavePreset = useCallback(async () => {
    const name = saveName.trim();
    if (!name) return;
    setSavingPreset(true);
    setPreviewError(null);
    try {
      if (editingPresetId) {
        const res = await fetch(`/api/voice-presets/${editingPresetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to rename preset");
        }
        const data = await res.json();
        setPresets((prev) => prev.map((p) => (p.id === editingPresetId ? { ...p, name: data.preset.name } : p)));
        setAppliedPresetName((prev) => (prev ? data.preset.name : prev));
      } else {
        const trimmed = customInstructions.trim();
        const voice = createGeminiVoicePersona(voicePersona, languageCode);
        if (!voice) throw new Error("Unknown voice");
        // Resolve the exact same instructions text that preview/generation would
        // send to Gemini, so the saved preset always matches what was heard.
        const { full } = resolveSpeakingInstructions({ voice, styleId, customInstructions: trimmed });
        const res = await fetch("/api/voice-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            geminiVoice: voicePersona,
            languageCode,
            styleId: trimmed ? undefined : styleId ?? undefined,
            styleInstructions: full,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to save preset");
        }
        const data = await res.json();
        setPresets((prev) => [data.preset, ...prev.filter((p) => p.id !== data.preset.id)]);
        setAppliedPresetName(data.preset.name);
      }
      setSaveDialogOpen(false);
      setSaveName("");
      setEditingPresetId(null);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Failed to save preset");
    } finally {
      setSavingPreset(false);
    }
  }, [saveName, editingPresetId, voicePersona, languageCode, styleId, customInstructions]);

  const handleGenerateClick = useCallback(() => {
    const trimmed = customInstructions.trim();
    void onGenerate(
      voicePersona,
      languageCode,
      trimmed ? undefined : styleId ?? undefined,
      trimmed || undefined
    );
  }, [onGenerate, voicePersona, languageCode, styleId, customInstructions]);

  const openStyleTab = useCallback(() => {
    setDialogTab("style");
    setVoiceDialogOpen(true);
  }, []);

  const voiceStyleDialog = (
    <>
      <Dialog open={voiceDialogOpen} onOpenChange={setVoiceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 gap-4 bg-white z-[100]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Mic className="w-5 h-5 text-indigo-500" />
              AI Voice Studio
            </DialogTitle>
            <DialogDescription className="sr-only">
              Select a voice and delivery style, and preview a sample before generating.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={(v) => setDialogTab(v as "voice" | "style")} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-2 w-full shrink-0 bg-slate-100 rounded-lg p-1 gap-1">
              <TabsTrigger
                value="voice"
                className="rounded-md py-1.5 text-sm font-medium text-slate-500 border-0 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
              >
                Voice
              </TabsTrigger>
              <TabsTrigger
                value="style"
                className="rounded-md py-1.5 text-sm font-medium text-slate-500 border-0 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
              >
                Style{styleId || isCustomActive ? ` · ${currentStyleLabel}` : ""}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="voice" className="flex-1 overflow-y-auto mt-3 space-y-3">
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
                    Male
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenderFilter("female")}
                    className={cn(
                      "flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-colors font-medium",
                      genderFilter === "female" ? "bg-white shadow-xs text-slate-900" : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Female
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pr-1">
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
            </TabsContent>

            <TabsContent value="style" className="flex-1 overflow-y-auto mt-4 space-y-6 pr-1">
              <div className="space-y-2.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Delivery style</h4>
                  <p className="text-xs text-slate-500">How the voice performs your script</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSelectStyle(null)}
                    className={cn(STYLE_CARD_BASE, !styleId && !isCustomActive ? STYLE_CARD_ACTIVE : STYLE_CARD_IDLE)}
                  >
                    <span
                      className={cn(
                        "absolute top-2.5 right-2.5 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                        !styleId && !isCustomActive ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"
                      )}
                    >
                      {!styleId && !isCustomActive && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 pr-5">Voice Default</span>
                    <span className="text-[11px] leading-snug text-slate-500">Matches the chosen voice's persona</span>
                  </button>

                  {STYLE_PRESETS.map((preset) => {
                    const active = styleId === preset.id && !isCustomActive;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectStyle(preset.id)}
                        className={cn(STYLE_CARD_BASE, active ? STYLE_CARD_ACTIVE : STYLE_CARD_IDLE)}
                      >
                        <span
                          className={cn(
                            "absolute top-2.5 right-2.5 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                            active ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"
                          )}
                        >
                          {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 pr-5">{preset.label}</span>
                        <span className="text-[11px] leading-snug text-slate-500">{preset.tagline}</span>
                      </button>
                    );
                  })}

                  {presets.map((preset) => {
                    const active = isCustomActive && customInstructions === preset.styleInstructions;
                    const languageLabel =
                      TTS_LANGUAGES.find((l) => l.code === preset.languageCode)?.label ?? preset.languageCode;
                    return (
                      <div
                        key={preset.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleApplyPreset(preset)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleApplyPreset(preset);
                          }
                        }}
                        className={cn(STYLE_CARD_BASE, "group cursor-pointer", active ? STYLE_CARD_ACTIVE : STYLE_CARD_IDLE)}
                      >
                        <span className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRenamePreset(preset);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            aria-label={`Rename preset ${preset.name}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePreset(preset.id);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            aria-label={`Delete preset ${preset.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                        <span className="text-sm font-semibold text-slate-900 pr-10 truncate">{preset.name}</span>
                        <span className="text-[11px] leading-snug text-slate-500 truncate">
                          {preset.geminiVoice} · {languageLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <div className="w-full border-t border-slate-100" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Or describe it yourself
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Textarea
                  value={customInstructions}
                  onChange={(e) => handleCustomInstructionsChange(e.target.value)}
                  placeholder={'e.g. "Speak fast and excitedly, like announcing a limited-time sale. Emphasize the price."'}
                  className={cn(
                    "text-sm min-h-[80px] rounded-xl",
                    isCustomActive && "border-indigo-400 ring-1 ring-indigo-200"
                  )}
                />
                <p className="text-[11px] text-slate-400">
                  Custom instructions override the styles above — tell the voice exactly how to perform.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <Button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={previewLoading}
                  className="h-9 px-4 gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm shadow-indigo-600/20 transition-colors"
                >
                  {previewLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  Preview sample
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingPresetId(null);
                    setSaveName("");
                    setSaveDialogOpen(true);
                  }}
                  className="h-9 px-4 gap-2 rounded-lg border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save as preset
                </Button>
                {previewError && (
                  <span className="text-xs text-rose-600">{previewError}</span>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          setSaveDialogOpen(open);
          if (!open) setEditingPresetId(null);
        }}
      >
        <DialogContent className="max-w-sm bg-white z-[110] p-6 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingPresetId ? "Rename preset" : "Save voice preset"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editingPresetId
                ? "Give this preset a new name."
                : "Save this voice + style combo so you can reuse it later."}
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="e.g. Energetic Kannada Ad"
            className="w-full p-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleSavePreset()} disabled={!saveName.trim() || savingPreset}>
              {savingPreset ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : editingPresetId ? (
                "Rename"
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

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

          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden text-left">
            <div className="px-4 py-3 hover:bg-slate-50/70 transition-colors">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                Language
              </span>
              <Select value={languageCode} onValueChange={setLanguageCode}>
                <SelectTrigger className="w-full h-auto p-0 mt-0.5 border-0 shadow-none bg-transparent text-sm font-semibold text-slate-900 justify-between focus:ring-0 focus-visible:ring-0">
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

            <button
              type="button"
              onClick={() => {
                setDialogTab("voice");
                setVoiceDialogOpen(true);
              }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50/70 transition-colors group"
            >
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                Narrator voice
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">
                  {voicePersona}
                  <span className="ml-1.5 font-normal text-slate-400">
                    {selectedVoiceInfo.gender === "male" ? "Male" : "Female"}
                  </span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </span>
            </button>

            <button
              type="button"
              onClick={openStyleTab}
              className="w-full text-left px-4 py-3 hover:bg-slate-50/70 transition-colors group"
            >
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                Style
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{currentStyleLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </span>
            </button>
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={busy || !selectedScriptId}
            onClick={handleGenerateClick}
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

        {voiceStyleDialog}
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
                {audio.voiceStyleLabel ? ` · ${audio.voiceStyleLabel}` : ""}
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

          <div className="flex flex-col lg:flex-row gap-3 lg:items-stretch">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Language
                </span>
                <Select value={languageCode} onValueChange={setLanguageCode}>
                  <SelectTrigger className="w-full h-auto p-0 mt-0.5 border-0 shadow-none bg-transparent text-sm font-semibold text-slate-900 justify-between focus:ring-0 focus-visible:ring-0">
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

              <button
                type="button"
                onClick={() => {
                  setDialogTab("voice");
                  setVoiceDialogOpen(true);
                }}
                className="text-left px-4 py-2.5 hover:bg-slate-50/70 transition-colors group min-w-0"
              >
                <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Narrator voice
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {voicePersona}
                    <span className="ml-1.5 font-normal text-slate-400">
                      {selectedVoiceInfo.gender === "male" ? "Male" : "Female"}
                    </span>
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                </span>
              </button>

              <button
                type="button"
                onClick={openStyleTab}
                className="text-left px-4 py-2.5 hover:bg-slate-50/70 transition-colors group min-w-0"
              >
                <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Style
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">{currentStyleLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                </span>
              </button>
            </div>

            <Button
              variant="secondary"
              disabled={busy || !selectedScriptId}
              onClick={handleGenerateClick}
              className="lg:h-auto lg:self-stretch px-5 gap-2"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate
            </Button>
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

      {voiceStyleDialog}
    </div>
  );
}
