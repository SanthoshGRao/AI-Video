"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Edit2, Loader2, Plus, Search, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GEMINI_VOICES, STYLE_PRESETS } from "@/lib/tts/voices";
import { cn } from "@/lib/utils";
import type { CharacterBundle, CharacterBundleMember } from "./types";

const STYLE_CARD_BASE =
  "relative text-left p-3 rounded-xl border transition-all flex flex-col gap-1 min-h-[60px] cursor-pointer";
const STYLE_CARD_ACTIVE = "border-indigo-600 bg-indigo-50/50 shadow-xs shadow-indigo-100 ring-1 ring-indigo-500/20";
const STYLE_CARD_IDLE = "border-slate-200 hover:border-indigo-200 hover:bg-slate-50/80";

export function CharacterBundleDialog({
  open,
  onOpenChange,
  initialBundle,
  currentLanguage = "kn-IN",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBundle?: CharacterBundle | null;
  currentLanguage?: string;
  onSaved: (bundle: CharacterBundle) => void;
}) {
  const isEditingBundle = Boolean(initialBundle);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [characters, setCharacters] = useState<CharacterBundleMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New / editing character form state
  const [editingCharName, setEditingCharName] = useState<string | null>(null);
  const [newCharName, setNewCharName] = useState("");
  const [newVoice, setNewVoice] = useState<string>(GEMINI_VOICES[0].name);
  const [newStyle, setNewStyle] = useState<string>("default");
  const [newCustom, setNewCustom] = useState("");

  // Tab & Voice filter states
  const [activeTab, setActiveTab] = useState<"voice" | "style">("voice");
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => previewAudioRef.current?.pause();
  }, []);

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setCharacters([]);
    setEditingCharName(null);
    setNewCharName("");
    setNewVoice(GEMINI_VOICES[0].name);
    setNewStyle("default");
    setNewCustom("");
    setActiveTab("voice");
    setSearchQuery("");
    setGenderFilter("all");
    setError(null);
  }, []);

  // Pre-fill state when opening in edit mode
  useEffect(() => {
    if (open) {
      if (initialBundle) {
        setName(initialBundle.name || "");
        setDescription(initialBundle.description || "");
        setCharacters(initialBundle.characters || []);
      } else {
        resetForm();
      }
    }
  }, [open, initialBundle, resetForm]);

  const auditionVoice = useCallback(async () => {
    setError(null);
    setPreviewLoading(true);
    try {
      const stylePreset = STYLE_PRESETS.find((s) => s.id === newStyle);
      const customText = newStyle === "custom" ? newCustom.trim() : (stylePreset?.tagline ?? "");

      const res = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceName: newVoice,
          languageCode: currentLanguage,
          styleId: newStyle === "default" || newStyle === "custom" ? undefined : newStyle,
          customInstructions: customText || undefined,
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
  }, [newVoice, newStyle, newCustom, currentLanguage]);

  const addOrUpdateCharacter = useCallback(() => {
    const trimmed = newCharName.trim();
    if (!trimmed) return;

    const stylePreset = STYLE_PRESETS.find((s) => s.id === newStyle);
    const member: CharacterBundleMember = {
      characterName: trimmed,
      voiceName: newVoice,
      languageCode: currentLanguage,
      styleId: newStyle === "default" ? null : newStyle,
      customInstructions: newStyle === "custom" ? newCustom : (stylePreset?.tagline ?? ""),
      presetName: null,
    };

    setCharacters((prev) => {
      const existingIdx = prev.findIndex(
        (c) => c.characterName.toLowerCase() === (editingCharName || trimmed).toLowerCase()
      );
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = member;
        return next;
      }
      return [...prev, member];
    });

    setEditingCharName(null);
    setNewCharName("");
    setNewCustom("");
    setError(null);
  }, [newCharName, newVoice, newStyle, newCustom, editingCharName]);

  const startEditCharacter = useCallback((c: CharacterBundleMember) => {
    setEditingCharName(c.characterName);
    setNewCharName(c.characterName);
    setNewVoice(c.voiceName);
    if (c.styleId) {
      setNewStyle(c.styleId);
      setNewCustom("");
    } else if (c.customInstructions) {
      setNewStyle("custom");
      setNewCustom(c.customInstructions);
    } else {
      setNewStyle("default");
      setNewCustom("");
    }
  }, []);

  const removeCharacter = useCallback((charName: string) => {
    setCharacters((prev) => prev.filter((c) => c.characterName !== charName));
    if (editingCharName?.toLowerCase() === charName.toLowerCase()) {
      setEditingCharName(null);
      setNewCharName("");
    }
  }, [editingCharName]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please provide a bundle name.");
      return;
    }
    if (characters.length === 0) {
      setError("Add at least one character.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/character-bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || undefined,
          characters,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }

      const data = await res.json();
      onSaved(data.bundle as CharacterBundle);
      onOpenChange(false);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [name, description, characters, onSaved, onOpenChange, resetForm]);

  const filteredVoices = GEMINI_VOICES.filter((v) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = v.name.toLowerCase().includes(q) || v.tone.toLowerCase().includes(q);
    const matchesGender = genderFilter === "all" || v.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  const selectedStyleLabel =
    newStyle === "default"
      ? "Voice Default"
      : newStyle === "custom"
      ? "Custom Instructions"
      : STYLE_PRESETS.find((s) => s.id === newStyle)?.label ?? "Default";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col bg-white p-6 gap-4 rounded-2xl z-[100]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900">
            {isEditingBundle ? "Edit Character Bundle" : "Create Character Bundle"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {isEditingBundle
              ? "Update bundle details, character voices, and delivery styles."
              : "Add characters with voice and delivery style, then save as a reusable bundle."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {/* Bundle Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bundle Name <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g., News Anchor Duo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-sm rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description (optional)
              </label>
              <Input
                type="text"
                placeholder="e.g., Lead Anchor & Field Reporter"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm rounded-xl"
              />
            </div>
          </div>

          {/* Add / Edit Character Section */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3.5">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center justify-between">
              <span>{editingCharName ? `Editing "${editingCharName}"` : "Add Character to Bundle"}</span>
              {editingCharName && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCharName(null);
                    setNewCharName("");
                  }}
                  className="text-[11px] text-indigo-600 hover:underline font-medium normal-case"
                >
                  + Add New Instead
                </button>
              )}
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Character Name <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g., ABC, Reporter, Host"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
                className="text-sm rounded-xl bg-white"
              />
            </div>

            {/* Voice & Style Picker Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "voice" | "style")}>
              <TabsList className="grid grid-cols-2 bg-slate-200/70 rounded-xl p-1 gap-1">
                <TabsTrigger
                  value="voice"
                  className="rounded-lg py-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 shadow-none"
                >
                  Voice · <span className="text-indigo-600">{newVoice}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="style"
                  className="rounded-lg py-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 shadow-none"
                >
                  Style · <span className="text-indigo-600">{selectedStyleLabel}</span>
                </TabsTrigger>
              </TabsList>

              {/* Voice Card Grid Content */}
              <TabsContent value="voice" className="space-y-3 mt-3">
                <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search voices by name or tone…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex gap-1 border border-slate-200 rounded-xl p-1 bg-white text-xs w-full sm:w-auto">
                    {(["all", "male", "female"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGenderFilter(g)}
                        className={cn(
                          "flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-colors font-medium capitalize text-[11px]",
                          genderFilter === g
                            ? "bg-indigo-600 text-white shadow-2xs"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2-Column Voice Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {filteredVoices.map((voice) => {
                    const selected = newVoice === voice.name;
                    return (
                      <button
                        key={voice.name}
                        type="button"
                        onClick={() => setNewVoice(voice.name)}
                        className={cn(
                          "text-left p-3 rounded-xl border-2 transition-all flex flex-col gap-1 cursor-pointer group bg-white",
                          selected
                            ? "border-indigo-600 bg-indigo-50/50 shadow-2xs"
                            : "border-slate-100 hover:border-slate-300 hover:bg-slate-50/80"
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {voice.name}
                          </span>
                          <span
                            className={cn(
                              "text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                              voice.gender === "male"
                                ? "bg-sky-100 text-sky-700"
                                : "bg-rose-100 text-rose-700"
                            )}
                          >
                            {voice.gender}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 italic leading-snug">
                          {voice.tone}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>

              {/* Style Content */}
              <TabsContent value="style" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => setNewStyle("default")}
                    className={cn(STYLE_CARD_BASE, newStyle === "default" ? STYLE_CARD_ACTIVE : STYLE_CARD_IDLE)}
                  >
                    {newStyle === "default" && <Check className="w-3.5 h-3.5 text-indigo-600 absolute top-2 right-2" />}
                    <span className="text-xs font-bold text-slate-900">Voice default</span>
                    <span className="text-[10px] text-slate-400">Natural tone</span>
                  </button>

                  {STYLE_PRESETS.map((preset) => {
                    const active = newStyle === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setNewStyle(preset.id)}
                        className={cn(STYLE_CARD_BASE, active ? STYLE_CARD_ACTIVE : STYLE_CARD_IDLE)}
                      >
                        {active && <Check className="w-3.5 h-3.5 text-indigo-600 absolute top-2 right-2" />}
                        <span className="text-xs font-bold text-slate-900">{preset.label}</span>
                        <span className="text-[10px] text-slate-500 leading-snug">{preset.tagline}</span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setNewStyle("custom")}
                    className={cn(STYLE_CARD_BASE, newStyle === "custom" ? STYLE_CARD_ACTIVE : STYLE_CARD_IDLE)}
                  >
                    {newStyle === "custom" && <Check className="w-3.5 h-3.5 text-indigo-600 absolute top-2 right-2" />}
                    <span className="text-xs font-bold text-slate-900">Custom</span>
                    <span className="text-[10px] text-slate-400">Director's instructions</span>
                  </button>
                </div>

                {newStyle === "custom" && (
                  <Textarea
                    value={newCustom}
                    onChange={(e) => setNewCustom(e.target.value)}
                    placeholder="Describe custom delivery style (e.g. Speak fast with high energy)..."
                    rows={2}
                    className="text-xs rounded-xl bg-white"
                  />
                )}
              </TabsContent>
            </Tabs>

            {/* Audition + Add/Update Action Row */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                onClick={() => void auditionVoice()}
                disabled={previewLoading}
                className="h-8 px-3 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-white gap-1.5 shadow-2xs"
              >
                {previewLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                )}
                Audition Voice
              </Button>
              <Button
                type="button"
                onClick={addOrUpdateCharacter}
                disabled={!newCharName.trim()}
                className="flex-1 h-8 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                {editingCharName ? "Update Character" : "Add Character"}
              </Button>
            </div>
          </div>

          {/* Included Characters List */}
          {characters.length > 0 && (
            <div className="border border-slate-200 rounded-2xl p-3 bg-white space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                <span>Bundle Characters</span>
                <span className="text-indigo-600 font-semibold">({characters.length})</span>
              </div>
              <ul className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {characters.map((c) => (
                  <li
                    key={c.characterName}
                    onClick={() => startEditCharacter(c)}
                    className={cn(
                      "flex items-center justify-between text-xs px-3 py-2 rounded-xl border transition-all cursor-pointer gap-2 group",
                      editingCharName?.toLowerCase() === c.characterName.toLowerCase()
                        ? "bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200"
                        : "bg-slate-50 hover:bg-indigo-50/40 border-slate-100 hover:border-indigo-200"
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Edit2 className="w-3 h-3 text-slate-300 group-hover:text-indigo-600 shrink-0" />
                      <span className="font-bold text-slate-900 truncate">
                        {c.characterName}
                      </span>
                    </div>
                    <span className="text-slate-400 text-[11px] mx-1">→</span>
                    <span className="text-indigo-700 font-semibold bg-white border border-indigo-100 px-2 py-0.5 rounded-md text-[11px]">
                      {c.voiceName}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCharacter(c.characterName);
                      }}
                      className="text-slate-300 hover:text-rose-600 p-1 transition-colors shrink-0 ml-auto"
                      title="Remove character"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
            disabled={saving}
            className="rounded-xl text-slate-600 text-xs h-9 px-4"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim() || characters.length === 0}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-5 shadow-2xs"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Saving…
              </>
            ) : isEditingBundle ? (
              "Update Bundle"
            ) : (
              "Save Bundle"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const CreateCharacterBundleDialog = CharacterBundleDialog;
