"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Save, Search, Sliders, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  GEMINI_VOICES,
  STYLE_PRESETS,
  TTS_LANGUAGES,
  createGeminiVoicePersona,
  findStylePreset,
  resolveSpeakingInstructions,
} from "@/lib/tts/voices";
import { cn } from "@/lib/utils";
import type { CastAssignment, VoiceStylePresetLike } from "./types";

const STYLE_CARD_BASE =
  "relative text-left p-3 rounded-xl border transition-all flex flex-col gap-1 min-h-[64px]";
const STYLE_CARD_ACTIVE = "border-indigo-500 bg-indigo-50/50 shadow-sm shadow-indigo-100";
const STYLE_CARD_IDLE = "border-slate-200 hover:border-indigo-200 hover:bg-slate-50/80";

function getPitchLabel(pitch: number): string {
  switch (pitch) {
    case 2:
      return "Cartoon Squeaky (+2)";
    case 1:
      return "High Pitch / Funny (+1)";
    case -1:
      return "Low Pitch (-1)";
    case -2:
      return "Deep Bass (-2)";
    default:
      return "Normal Pitch (0)";
  }
}

export function AvatarDialog({
  open,
  onOpenChange,
  characterName,
  value,
  onChange,
  presets,
  onPresetsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterName: string;
  value: CastAssignment;
  onChange: (next: CastAssignment) => void;
  presets: VoiceStylePresetLike[];
  onPresetsChange: (presets: VoiceStylePresetLike[]) => void;
}) {
  const [tab, setTab] = useState<"voice" | "pitch" | "style">("voice");
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => previewAudioRef.current?.pause();
  }, []);

  useEffect(() => {
    if (open) {
      setTab("voice");
      setError(null);
      setSaveName(characterName);
    }
  }, [open, characterName]);

  const isCustom = value.customInstructions.trim().length > 0;

  const update = useCallback(
    (patch: Partial<CastAssignment>) => onChange({ ...value, ...patch }),
    [onChange, value]
  );

  const selectVoice = useCallback((name: string) => update({ voiceName: name }), [update]);

  const selectStyle = useCallback(
    (styleId: string | null) => update({ styleId, customInstructions: "", presetName: null }),
    [update]
  );

  const setCustom = useCallback(
    (text: string) => update({ customInstructions: text, presetName: null }),
    [update]
  );

  const applyPreset = useCallback(
    (preset: VoiceStylePresetLike) =>
      update({
        voiceName: preset.geminiVoice,
        languageCode: preset.languageCode,
        styleId: null,
        customInstructions: preset.styleInstructions,
        presetName: preset.name,
      }),
    [update]
  );

  const deletePreset = useCallback(
    (id: string) => {
      onPresetsChange(presets.filter((p) => p.id !== id));
      void fetch(`/api/voice-presets/${id}`, { method: "DELETE" }).catch(() => {});
    },
    [presets, onPresetsChange]
  );

  const audition = useCallback(async () => {
    setError(null);
    setPreviewLoading(true);
    try {
      const trimmed = value.customInstructions.trim();
      const res = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceName: value.voiceName,
          languageCode: value.languageCode,
          styleId: trimmed ? undefined : value.styleId ?? undefined,
          customInstructions: trimmed || undefined,
          pitch: value.pitch ?? 0,
          pace: value.pace ?? 1.0,
          emotion: value.emotion ?? "normal",
          energy: value.energy ?? "balanced",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Audition failed");
      }
      const url = URL.createObjectURL(await res.blob());
      previewAudioRef.current?.pause();
      const audioEl = new Audio(url);
      audioEl.addEventListener("ended", () => URL.revokeObjectURL(url));
      previewAudioRef.current = audioEl;
      await audioEl.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audition failed");
    } finally {
      setPreviewLoading(false);
    }
  }, [value]);

  const saveAvatar = useCallback(async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = value.customInstructions.trim();
      const voice = createGeminiVoicePersona(value.voiceName, value.languageCode);
      if (!voice) throw new Error("Unknown voice");
      const { full } = resolveSpeakingInstructions({
        voice,
        styleId: trimmed ? null : value.styleId,
        customInstructions: trimmed || null,
        pitch: value.pitch ?? 0,
        pace: value.pace ?? 1.0,
        emotion: value.emotion ?? "normal",
        energy: value.energy ?? "balanced",
      });
      const res = await fetch("/api/voice-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          geminiVoice: value.voiceName,
          languageCode: value.languageCode,
          styleId: trimmed ? undefined : value.styleId ?? undefined,
          styleInstructions: full,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save avatar");
      }
      const data = await res.json();
      onPresetsChange([data.preset, ...presets.filter((p) => p.id !== data.preset.id)]);
      update({ presetName: data.preset.name });
      setSaveOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save avatar");
    } finally {
      setSaving(false);
    }
  }, [saveName, value, presets, onPresetsChange, update]);

  const filteredVoices = GEMINI_VOICES.filter((v) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = v.name.toLowerCase().includes(q) || v.tone.toLowerCase().includes(q);
    const matchesGender = genderFilter === "all" || v.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  const styleLabel = value.presetName ?? (isCustom ? "Custom" : findStylePreset(value.styleId)?.label ?? "Voice default");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[86vh] flex flex-col p-6 gap-4 bg-white z-[100]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Cast <span className="text-indigo-600">{characterName}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Choose a voice and delivery style for this character.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "voice" | "pitch" | "style")} className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-3 shrink-0">
              <TabsList className="grid grid-cols-3 flex-1 bg-slate-100 rounded-lg p-1 gap-1">
                <TabsTrigger
                  value="voice"
                  className="rounded-md py-1.5 text-xs sm:text-sm font-medium text-slate-500 border-0 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm truncate"
                >
                  Voice · {value.voiceName}
                </TabsTrigger>
                <TabsTrigger
                  value="pitch"
                  className="rounded-md py-1.5 text-xs sm:text-sm font-medium text-slate-500 border-0 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm truncate flex items-center justify-center gap-1"
                >
                  <Sliders className="w-3.5 h-3.5 shrink-0" />
                  Pitch & Modifiers
                </TabsTrigger>
                <TabsTrigger
                  value="style"
                  className="rounded-md py-1.5 text-xs sm:text-sm font-medium text-slate-500 border-0 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm truncate"
                >
                  Style · {styleLabel}
                </TabsTrigger>
              </TabsList>
              <Select value={value.languageCode} onValueChange={(code) => update({ languageCode: code })}>
                <SelectTrigger className="h-9 w-[140px] text-sm shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTS_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TabsContent value="voice" className="flex-1 overflow-y-auto mt-3 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search voices by name or tone…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-1 border border-slate-100 rounded-lg p-1 bg-slate-50/50 text-xs w-full sm:w-auto">
                  {(["all", "male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGenderFilter(g)}
                      className={cn(
                        "flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-colors font-medium capitalize",
                        genderFilter === g ? "bg-white shadow-xs text-slate-900" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pr-1">
                {filteredVoices.map((voice) => {
                  const selected = value.voiceName === voice.name;
                  return (
                    <button
                      key={voice.name}
                      type="button"
                      onClick={() => selectVoice(voice.name)}
                      className={cn(
                        "text-left p-3.5 rounded-xl border-2 transition-all flex flex-col gap-1.5 group",
                        selected ? "border-indigo-600 bg-indigo-50/40" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {voice.name}
                        </span>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide",
                          voice.gender === "male" ? "bg-sky-50 text-sky-700" : "bg-rose-50 text-rose-700"
                        )}>
                          {voice.gender}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 italic">{voice.tone}</span>
                    </button>
                  );
                })}
                {filteredVoices.length === 0 && (
                  <div className="col-span-full py-8 text-center text-slate-400 text-sm">
                    No voices match “{searchQuery}”
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="pitch" className="flex-1 overflow-y-auto mt-4 space-y-6 pr-1">
              {/* Voice Pitch Slider */}
              <div className="space-y-3 p-4 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-violet-50/40 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-indigo-600" />
                      Voice Pitch
                    </label>
                    <p className="text-xs text-slate-500">
                      Set pitch level (high pitch feels funny & comedic, low pitch feels deep).
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full font-bold shadow-2xs border shrink-0",
                      (value.pitch ?? 0) > 0
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : (value.pitch ?? 0) < 0
                        ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    )}
                  >
                    {getPitchLabel(value.pitch ?? 0)}
                  </span>
                </div>

                {/* Slider */}
                <div className="pt-2 pb-1 px-1">
                  <Slider
                    value={[value.pitch ?? 0]}
                    min={-2}
                    max={2}
                    step={1}
                    onValueChange={([val]) => update({ pitch: val })}
                    className="cursor-pointer"
                  />
                </div>

                {/* Pitch Preset Quick Buttons */}
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  {[
                    { val: -2, label: "Deep" },
                    { val: -1, label: "Low" },
                    { val: 0, label: "Normal" },
                    { val: 1, label: "High / Funny" },
                    { val: 2, label: "Cartoon" },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => update({ pitch: p.val })}
                      className={cn(
                        "py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all flex flex-col items-center gap-0.5",
                        (value.pitch ?? 0) === p.val
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                      )}
                    >
                      <span className="truncate text-[11px] font-medium">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Speaking Pace / Speed */}
              <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-bold text-slate-900">Speaking Speed</label>
                    <p className="text-xs text-slate-500">Control pace of the voice delivery.</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-700">
                    {(value.pace ?? 1.0).toFixed(1)}x
                  </span>
                </div>
                <div className="px-1 pt-1">
                  <Slider
                    value={[value.pace ?? 1.0]}
                    min={0.7}
                    max={1.3}
                    step={0.1}
                    onValueChange={([val]) => update({ pace: Number(val.toFixed(1)) })}
                    className="cursor-pointer"
                  />
                </div>
                <div className="flex justify-between gap-2 text-xs pt-1">
                  {[0.8, 1.0, 1.2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => update({ pace: spd })}
                      className={cn(
                        "px-3 py-1 rounded-md border font-medium transition-colors",
                        (value.pace ?? 1.0) === spd
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      {spd === 1.0 ? "Normal (1.0x)" : spd < 1 ? `Slow (${spd}x)` : `Fast (${spd}x)`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vocal Emotion / Character Modulation */}
              <div className="space-y-2.5">
                <h4 className="text-sm font-bold text-slate-900">Voice Mood & Character Modulation</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: "normal", label: "Default", tagline: "Standard natural tone" },
                    { id: "funny", label: "Funny / Humorous", tagline: "Playful comic delivery" },
                    { id: "excited", label: "Excited", tagline: "High energy & joy" },
                    { id: "dramatic", label: "Dramatic", tagline: "Intense theatrical read" },
                    { id: "whispering", label: "Whispering", tagline: "Soft & quiet voice" },
                    { id: "sarcastic", label: "Sarcastic", tagline: "Playful ironic tone" },
                    { id: "robotic", label: "Robotic", tagline: "Monotone mechanical read" },
                  ].map((emo) => {
                    const active = (value.emotion ?? "normal") === emo.id;
                    return (
                      <button
                        key={emo.id}
                        type="button"
                        onClick={() => update({ emotion: emo.id })}
                        className={cn(
                          "text-left p-3 rounded-xl border transition-all flex flex-col gap-0.5",
                          active
                            ? "border-indigo-600 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-300"
                            : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
                        )}
                      >
                        <span className="text-xs font-bold text-slate-900">{emo.label}</span>
                        <span className="text-[10px] text-slate-500">{emo.tagline}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Projection & Energy */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900">Vocal Energy</h4>
                <div className="flex gap-2">
                  {[
                    { id: "relaxed", label: "Relaxed" },
                    { id: "balanced", label: "Balanced" },
                    { id: "high", label: "High Energy" },
                  ].map((nrg) => (
                    <button
                      key={nrg.id}
                      type="button"
                      onClick={() => update({ energy: nrg.id })}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all",
                        (value.energy ?? "balanced") === nrg.id
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {nrg.label}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="style" className="flex-1 overflow-y-auto mt-4 space-y-6 pr-1">
              <div className="space-y-2.5">
                <h4 className="text-sm font-semibold text-slate-900">Delivery style</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => selectStyle(null)}
                    className={cn(STYLE_CARD_BASE, !value.styleId && !isCustom ? STYLE_CARD_ACTIVE : STYLE_CARD_IDLE)}
                  >
                    <StyleRadio active={!value.styleId && !isCustom} />
                    <span className="text-sm font-semibold text-slate-900 pr-5">Voice default</span>
                  </button>

                  {STYLE_PRESETS.map((preset) => {
                    const active = value.styleId === preset.id && !isCustom;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => selectStyle(preset.id)}
                        className={cn(STYLE_CARD_BASE, active ? STYLE_CARD_ACTIVE : STYLE_CARD_IDLE)}
                      >
                        <StyleRadio active={active} />
                        <span className="text-sm font-semibold text-slate-900 pr-5">{preset.label}</span>
                        <span className="text-[11px] leading-snug text-slate-500">{preset.tagline}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {presets.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-sm font-semibold text-slate-900">Saved avatars</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {presets.map((preset) => {
                      const active = isCustom && value.customInstructions === preset.styleInstructions;
                      const languageLabel = TTS_LANGUAGES.find((l) => l.code === preset.languageCode)?.label ?? preset.languageCode;
                      return (
                        <div
                          key={preset.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => applyPreset(preset)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyPreset(preset); }
                          }}
                          className={cn(STYLE_CARD_BASE, "group cursor-pointer", active ? STYLE_CARD_ACTIVE : STYLE_CARD_IDLE)}
                        >
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deletePreset(preset.id); }}
                            className="absolute top-2 right-2 p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold"
                            aria-label={`Delete avatar ${preset.name}`}
                          >
                            ✕
                          </button>
                          <span className="text-sm font-semibold text-slate-900 pr-6 truncate">{preset.name}</span>
                          <span className="text-[11px] leading-snug text-slate-500 truncate">
                            {preset.geminiVoice} · {languageLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Custom instructions</h4>
                <Textarea
                  value={value.customInstructions}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Describe the delivery…"
                  className={cn("text-sm min-h-[80px] rounded-xl", isCustom && "border-indigo-400 ring-1 ring-indigo-200")}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-2.5 flex-wrap border-t border-slate-100 pt-4">
            <Button
              type="button"
              onClick={() => void audition()}
              disabled={previewLoading}
              className="h-9 px-4 gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm shadow-indigo-600/20"
            >
              {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
              Audition voice
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setSaveName(value.presetName || characterName); setSaveOpen(true); }}
              className="h-9 px-4 gap-2 rounded-lg border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save as avatar
            </Button>
            {error && <span className="text-xs text-rose-600">{error}</span>}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="ml-auto h-9 px-4 text-sm font-medium"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm bg-white z-[110] p-6 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Save avatar</DialogTitle>
            <DialogDescription className="sr-only">Name this voice + style avatar.</DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Avatar name"
            className="w-full p-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void saveAvatar()} disabled={!saveName.trim() || saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StyleRadio({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "absolute top-2.5 right-2.5 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
        active ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"
      )}
    >
      {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
    </span>
  );
}
