"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Clapperboard,
  FileText,
  Info,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransliterateTextarea } from "@/components/ui/transliterate-textarea";
import { TTS_LANGUAGES } from "@/lib/tts/voices";
import { parseSkit, type SkitLine } from "@/lib/skit/parse-script";
import { transliterationLang } from "@/lib/skit/project";
import { cn } from "@/lib/utils";
import { AvatarDialog } from "./avatar-dialog";
import { CharacterBundleDialog } from "./character-bundle-dialog";
import { ConversationPlayer, type CombinedAudio, type PreviewClip } from "./conversation-player";
import {
  DEFAULT_CHARACTER_BUNDLES,
  defaultVoiceForIndex,
  describeStyle,
  speakerColor,
  type CastAssignment,
  type CharacterBundle,
  type VoiceStylePresetLike,
} from "./types";

const STORAGE_KEY = "skit-studio.v1";
const MAX_LINES = 40;

/** The "situation" fed to TTS as acting direction: scene + preceding narration. */
function lineContext(l: SkitLine): string | undefined {
  const parts: string[] = [];
  if (l.scene) parts.push(l.scene);
  if (l.directionBefore) parts.push(l.directionBefore);
  const ctx = parts.join(". ").trim();
  return ctx || undefined;
}

type PersistShape = {
  scriptText: string;
  language: string;
  cast: Record<string, CastAssignment>;
};

function loadPersisted(): PersistShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistShape) : null;
  } catch {
    return null;
  }
}

export function SkitStudio({
  projectId,
  projectTitle,
  initial,
  onPersist,
}: {
  /** When set, the session is persisted to this project instead of localStorage. */
  projectId?: string;
  projectTitle?: string;
  initial?: PersistShape;
  onPersist?: (data: PersistShape) => void;
} = {}) {
  // Bootstrap once: project data (if embedded in a project) wins, otherwise the
  // standalone localStorage session.
  const bootstrap = useMemo<PersistShape | null>(
    () => initial ?? (projectId ? null : loadPersisted()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [scriptText, setScriptText] = useState(bootstrap?.scriptText ?? "");
  const [language, setLanguage] = useState(bootstrap?.language ?? "kn-IN");
  const [cast, setCast] = useState<Record<string, CastAssignment>>(bootstrap?.cast ?? {});
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [presets, setPresets] = useState<VoiceStylePresetLike[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  const [castTab, setCastTab] = useState<"cast" | "bundles">("cast");
  const [userBundles, setUserBundles] = useState<CharacterBundle[]>([]);
  const [createBundleOpen, setCreateBundleOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<CharacterBundle | null>(null);
  const [bundleFeedback, setBundleFeedback] = useState<{ type: "success" | "info"; message: string } | null>(null);

  const [clips, setClips] = useState<PreviewClip[]>([]);
  const [previewMeta, setPreviewMeta] = useState<{ direction?: string; pauseBeforeMs?: number }[]>([]);
  const [combined, setCombined] = useState<CombinedAudio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlayKey, setAutoPlayKey] = useState(0);
  const previewSignatureRef = useRef<string | null>(null);

  const parsed = useMemo(() => parseSkit(scriptText), [scriptText]);

  // Load saved avatars once.
  useEffect(() => {
    fetch("/api/voice-presets")
      .then((res) => (res.ok ? res.json() : { presets: [] }))
      .then((data) => setPresets(Array.isArray(data.presets) ? data.presets : []))
      .catch(() => {});
  }, []);

  // Load saved user character bundles.
  useEffect(() => {
    fetch("/api/character-bundles")
      .then((res) => (res.ok ? res.json() : { bundles: [] }))
      .then((data) => {
        if (Array.isArray(data.bundles)) {
          setUserBundles(data.bundles);
        }
      })
      .catch(() => {});
  }, []);

  // Give every newly-detected character a default voice so preview works
  // immediately. Existing assignments are preserved across edits.
  useEffect(() => {
    setCast((prev) => {
      let changed = false;
      const next = { ...prev };
      parsed.characters.forEach((name, i) => {
        if (!next[name]) {
          next[name] = {
            voiceName: defaultVoiceForIndex(i),
            languageCode: language,
            styleId: null,
            customInstructions: "",
            presetName: null,
            pitch: 0,
            pace: 1.0,
            emotion: "normal",
            energy: "balanced",
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [parsed.characters, language]);

  // Persist the working session. In a project, debounce a save to the DB;
  // standalone, mirror to localStorage synchronously.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: PersistShape = { scriptText, language, cast };

    if (projectId && onPersist) {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => onPersist(payload), 700);
      return () => {
        if (persistTimer.current) clearTimeout(persistTimer.current);
      };
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [scriptText, language, cast, projectId, onPersist]);

  const setSkitLanguage = useCallback((code: string) => {
    setLanguage(code);
    setCast((prev) => {
      const next: Record<string, CastAssignment> = {};
      for (const [name, a] of Object.entries(prev)) {
        next[name] = { ...a, languageCode: code };
      }
      return next;
    });
  }, []);

  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [appliedBundleId, setAppliedBundleId] = useState<string | null>(null);
  const appliedKeyRef = useRef<string>("");

  const toggleBundleSelect = useCallback((bundleId: string) => {
    setSelectedBundleIds((prev) =>
      prev.includes(bundleId)
        ? prev.filter((id) => id !== bundleId)
        : [...prev, bundleId]
    );
  }, []);

  // Safe effect to apply selected bundles whenever selection changes
  useEffect(() => {
    const key = selectedBundleIds.join(",");
    if (key === appliedKeyRef.current) return;
    appliedKeyRef.current = key;

    if (selectedBundleIds.length === 0) return;

    let matchedCount = 0;
    const assignedScriptCharacters = new Set<string>();
    const details: string[] = [];

    setCast((prevCast) => {
      const nextCast = { ...prevCast };

      selectedBundleIds.forEach((bundleId) => {
        const bundle = userBundles.find((b) => b.id === bundleId);
        if (!bundle) return;

        parsed.characters.forEach((scriptCharName) => {
          const normalizedScript = scriptCharName.trim().toLowerCase();

          // First selected bundle priority rule
          if (assignedScriptCharacters.has(normalizedScript)) return;

          const member = bundle.characters.find(
            (b) => b.characterName.trim().toLowerCase() === normalizedScript
          );

          if (member) {
            matchedCount++;
            assignedScriptCharacters.add(normalizedScript);
            details.push(`${scriptCharName} (${member.voiceName})`);

            nextCast[scriptCharName] = {
              voiceName: member.voiceName,
              languageCode: language,
              styleId: member.styleId ?? null,
              customInstructions: member.customInstructions || "",
              presetName: member.presetName || bundle.name,
            };
          }
        });
      });

      return nextCast;
    });

    if (selectedBundleIds.length === 1) {
      setAppliedBundleId(selectedBundleIds[0]);
    } else {
      setAppliedBundleId(null);
    }

    if (matchedCount > 0) {
      setBundleFeedback({
        type: "success",
        message: `Applied ${matchedCount} character${matchedCount > 1 ? "s" : ""}: ${details.join(", ")}`,
      });
    } else {
      setBundleFeedback({
        type: "info",
        message: `Selected bundle(s) have no matching characters in current script.`,
      });
    }
  }, [selectedBundleIds, userBundles, parsed.characters, language]);

  const deleteUserBundle = useCallback((id: string) => {
    setUserBundles((prev) => prev.filter((b) => b.id !== id));
    void fetch(`/api/character-bundles/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const signature = useMemo(
    () => JSON.stringify({ lines: parsed.lines, language, cast }),
    [parsed.lines, language, cast]
  );
  const stale = previewSignatureRef.current !== signature;

  const handlePreview = useCallback(async () => {
    const sourceLines = parsed.lines.slice(0, MAX_LINES);
    const lines = sourceLines.map((l) => ({
      speaker: l.speaker,
      text: l.text,
      context: lineContext(l),
      pauseBeforeMs: l.pauseBeforeMs,
    }));
    if (lines.length === 0) {
      setError("Write some dialogue first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const castArray = parsed.characters.map((name) => {
        const a = cast[name];
        const trimmed = a?.customInstructions?.trim();
        return {
          speaker: name,
          voiceName: a?.voiceName ?? defaultVoiceForIndex(parsed.characters.indexOf(name)),
          languageCode: a?.languageCode ?? language,
          styleId: trimmed ? undefined : a?.styleId ?? undefined,
          customInstructions: trimmed || undefined,
          pitch: a?.pitch ?? 0,
          pace: a?.pace ?? 1.0,
          emotion: a?.emotion ?? "normal",
          energy: a?.energy ?? "balanced",
        };
      });

      const res = await fetch("/api/skit/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageCode: language, lines, cast: castArray }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Preview failed (${res.status})`);
      }
      const data = (await res.json()) as { clips: PreviewClip[]; combined: CombinedAudio | null };
      setClips(data.clips);
      setCombined(data.combined);
      setPreviewMeta(sourceLines.map((l) => ({ direction: l.directionBefore, pauseBeforeMs: l.pauseBeforeMs })));
      previewSignatureRef.current = signature;
      setAutoPlayKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [parsed.lines, parsed.characters, cast, language, signature]);

  const editingAssignment = editing ? cast[editing] : null;
  const truncatedNotice = parsed.lines.length > MAX_LINES;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Clapperboard className="w-6 h-6 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {projectTitle ?? "Skit Studio"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Language</span>
          <Select value={language} onValueChange={setSkitLanguage}>
            <SelectTrigger className="h-9 w-[160px] text-sm bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TTS_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Script pane */}
        <Card className="lg:col-span-3 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                Script
              </h2>
              {scriptText.trim() && (
                <button
                  type="button"
                  onClick={() => setScriptText("")}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>

            <TransliterateTextarea
              value={scriptText}
              onChange={setScriptText}
              language={transliterationLang(language)}
              placeholder={'Name:\n"their line"'}
              className="min-h-[440px] font-mono text-sm leading-relaxed rounded-xl resize-y"
            />

            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span>{parsed.characters.length} characters</span>
              <span>{parsed.lines.length} lines</span>
              <span>{parsed.wordCount} words</span>
            </div>
          </CardContent>
        </Card>

        {/* Cast + preview pane */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardContent className="p-5 space-y-3">
              <Tabs value={castTab} onValueChange={(v) => setCastTab(v as "cast" | "bundles")}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <TabsList className="grid grid-cols-2 flex-1 bg-slate-100 p-1 rounded-xl">
                    <TabsTrigger
                      value="cast"
                      className="rounded-lg py-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 shadow-none"
                    >
                      Cast ({parsed.characters.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="bundles"
                      className="rounded-lg py-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 shadow-none"
                    >
                      Character Bundles
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="cast" className="space-y-3 mt-0">
                  {parsed.characters.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">No characters yet</p>
                  ) : (
                    <ul className="space-y-2">
                      {parsed.characters.map((name, i) => {
                        const a = cast[name];
                        const color = speakerColor(i);
                        return (
                          <li key={name}>
                            <button
                              type="button"
                              onClick={() => setEditing(name)}
                              className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-slate-50/70 transition-all flex items-center gap-3 group"
                            >
                              <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", color.dot)} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-slate-900 truncate">{name}</span>
                                <span className="block text-xs text-slate-400 truncate">
                                  {a ? `${a.voiceName} · ${describeStyle(a)}` : "Assigning…"}
                                </span>
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                </TabsContent>

                <TabsContent value="bundles" className="space-y-3 mt-0">
                  {bundleFeedback && (
                    <div
                      className={cn(
                        "p-2.5 rounded-xl text-xs flex items-start gap-2 border",
                        bundleFeedback.type === "success"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      )}
                    >
                      {bundleFeedback.type === "success" ? (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <span className="flex-1">{bundleFeedback.message}</span>
                    </div>
                  )}

                  {/* Create Bundle button */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => setCreateBundleOpen(true)}
                      className="w-full h-9 text-xs font-semibold rounded-xl border border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/70 text-indigo-700 gap-1.5 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create Bundle
                    </Button>
                  </div>

                  {userBundles.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 space-y-1 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 p-4">
                      <p className="font-semibold text-slate-700">No character bundles yet</p>
                      <p className="text-slate-400 text-[11px]">Click "Create Bundle" to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                      {userBundles.map((b) => {
                        const isApplied = appliedBundleId === b.id;
                        const priorityIndex = selectedBundleIds.indexOf(b.id);
                        const isChecked = priorityIndex >= 0;

                        return (
                          <div
                            key={b.id}
                            onClick={() => toggleBundleSelect(b.id)}
                            className={cn(
                              "p-3 rounded-xl border bg-white space-y-2 transition-all cursor-pointer",
                              isChecked
                                ? "border-2 border-indigo-500 bg-indigo-50/30 shadow-sm ring-1 ring-indigo-400/20"
                                : isApplied
                                ? "border-emerald-400 bg-emerald-50/30 shadow-sm"
                                : "border-slate-200 hover:border-slate-300 shadow-2xs"
                            )}
                          >
                            {/* Header: priority label + name + actions */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex items-center gap-1.5">
                                <h4 className="text-xs font-bold text-slate-900 truncate">
                                  {isApplied && <Check className="w-3.5 h-3.5 text-emerald-600 inline mr-1 -mt-0.5" />}
                                  {b.name}
                                </h4>
                                {isChecked && selectedBundleIds.length > 1 && (
                                  <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.2 rounded-full shrink-0">
                                    #{priorityIndex + 1}
                                  </span>
                                )}
                                {b.description && (
                                  <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                                    {b.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingBundle(b);
                                  }}
                                  className="text-slate-300 hover:text-indigo-600 p-0.5 transition-colors"
                                  title="Edit bundle"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteUserBundle(b.id);
                                  }}
                                  className="text-slate-300 hover:text-rose-500 p-0.5 transition-colors"
                                  title="Delete bundle"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Character → voice tags */}
                            <div className="flex flex-wrap gap-1">
                              {b.characters.map((c) => (
                                <span
                                  key={c.characterName}
                                  className="text-[11px] bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md"
                                >
                                  <span className="font-semibold text-slate-800">{c.characterName}</span>
                                  <span className="text-slate-400 mx-1">→</span>
                                  <span className="text-indigo-600 font-medium">{c.voiceName}</span>
                                </span>
                              ))}
                            </div>

                            {/* Apply button */}
                            <Button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBundleSelect(b.id);
                              }}
                              className={cn(
                                "w-full h-8 text-xs font-semibold rounded-lg transition-all border",
                                isChecked
                                  ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 shadow-2xs"
                                  : "bg-slate-50 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 border-slate-200 hover:border-indigo-200 font-medium"
                              )}
                            >
                              {isChecked ? "✓ Selected & Applied" : "Apply Bundle"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Preview</h2>
                {clips.length > 0 && !stale && (
                  <span className="text-[11px] text-emerald-600 font-medium">Up to date</span>
                )}
                {clips.length > 0 && stale && (
                  <span className="text-[11px] text-amber-600 font-medium">Script changed</span>
                )}
              </div>

              <Button
                type="button"
                onClick={() => void handlePreview()}
                disabled={loading || parsed.lines.length === 0}
                className="w-full h-11 gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold shadow-md shadow-indigo-500/20 transition-all text-sm tracking-wide"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Voicing…
                  </>
                ) : clips.length > 0 && stale ? (
                  "Regenerate"
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Preview
                  </>
                )}
              </Button>

              {error && <p className="text-xs text-rose-600">{error}</p>}
              {truncatedNotice && (
                <p className="text-[11px] text-amber-600">
                  Previewing the first {MAX_LINES} lines.
                </p>
              )}

              {clips.length > 0 && (
                <div className={cn("transition-opacity", stale && "opacity-60")}>
                  <ConversationPlayer
                    clips={clips}
                    combined={combined}
                    characters={parsed.characters}
                    meta={previewMeta}
                    autoPlayKey={autoPlayKey}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {editing && editingAssignment && (
        <AvatarDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          characterName={editing}
          value={editingAssignment}
          onChange={(next) => setCast((prev) => ({ ...prev, [editing]: next }))}
          presets={presets}
          onPresetsChange={setPresets}
        />
      )}

      {(createBundleOpen || editingBundle) && (
        <CharacterBundleDialog
          open={createBundleOpen || Boolean(editingBundle)}
          initialBundle={editingBundle}
          currentLanguage={language}
          onOpenChange={(open) => {
            if (!open) {
              setCreateBundleOpen(false);
              setEditingBundle(null);
            }
          }}
          onSaved={(savedBundle) => {
            setUserBundles((prev) => {
              const exists = prev.some((b) => b.id === savedBundle.id);
              if (exists) {
                return prev.map((b) => (b.id === savedBundle.id ? savedBundle : b));
              }
              return [savedBundle, ...prev];
            });
            setEditingBundle(null);
          }}
        />
      )}
    </div>
  );
}
