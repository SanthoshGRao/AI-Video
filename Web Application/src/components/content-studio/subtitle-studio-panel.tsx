"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  Download,
  Loader2,
  Play,
  Pause,
  Palette,
  Type,
  Globe,
  Sparkles,
  Save,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/stores/ui-store";
import { cuesToSrt } from "@/lib/subtitles/cues";
import { layoutFactTimings } from "@/lib/facts/overlay-timing";
import {
  SUBTITLE_STYLE_PRESETS,
  resolveSubtitleStyle,
  TITLE_FACT_CATEGORY_LABELS,
} from "@/lib/subtitles/presets";
import {
  studioSubtitleBoxStyle,
  studioSubtitleInsetStyle,
  studioSubtitleTextStyle,
  studioTitleBoxStyle,
  studioTitleInsetStyle,
  studioTitleTextStyle,
} from "@/lib/subtitles/studio-overlay-styles";
import type { SubtitleCue, SubtitleStyle } from "@/lib/subtitles/types";
import { cn } from "@/lib/utils";
import { FontPicker } from "@/components/ui/font-picker";
import { Switch } from "@/components/ui/switch";

type AudioLike = {
  id: string;
  r2Url: string;
  durationMs: number;
};

type TrackLike = {
  id: string;
  cues: SubtitleCue[];
  stylePreset: string;
  customStyle: SubtitleStyle | null;
  isBurntIn: boolean;
  audioAssetId: string | null;
  language: string;
};

type TitleRow = { id: string; text: string; category?: string; startMs: number; endMs: number };
type DraftTitleRow = { id?: string; text: string; category?: string; startMs?: number; endMs?: number };
type TitleStyle = {
  preset: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundOpacity: number;
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline";
  letterSpacing: number;
  shadow: boolean;
};

const TITLE_FACT_LABELS = TITLE_FACT_CATEGORY_LABELS;

function titleSampleForPreset(key: string): string {
  // If it's a custom preset, it might have a "custom_" prefix, remove it.
  const name = key.replace(/^custom_/, "").replace(/_/g, " ");
  // Capitalize the first letter of each word
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Capitalize first letter of each word for title display. */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build short, punchy title text matching Instagram reel style — without emojis, no verbose labels. */
function buildFactTitles(key: string, value: unknown): { text: string; category: string }[] {
  const label = TITLE_FACT_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").trim();
  if (value == null || value === "") return [];

  switch (key) {
    case "propertyType": {
      const s = String(value).trim();
      return s ? [{ text: `${titleCase(s)}`, category: label }] : [];
    }
    case "location": {
      const s = String(value).trim();
      return s ? [{ text: `${titleCase(s)}`, category: label }] : [];
    }
    case "plotSize": {
      const s = String(value).trim();
      return s ? [{ text: `${titleCase(s)}`, category: label }] : [];
    }
    case "price": {
      const s = String(value).trim();
      return s ? [{ text: `${s}`, category: label }] : [];
    }
    case "roadAccess": {
      const s = String(value).trim();
      if (!s) return [];
      // If value already contains "road", don't append it
      const hasRoad = /road/i.test(s);
      return [{ text: `${titleCase(s)}${hasRoad ? "" : " Road"}`, category: label }];
    }
    case "water": {
      if (!Array.isArray(value) || value.length === 0) return [];
      const sources = value.filter((v) => typeof v === "string" && v.trim()).map((v) => titleCase(String(v).trim()));
      return sources.length > 0 ? [{ text: `${sources.join(", ")}`, category: label }] : [];
    }
    case "electricity": {
      if (typeof value !== "boolean") return [];
      return value ? [{ text: "Electricity Available", category: label }] : [];
    }
    case "legal": {
      if (!Array.isArray(value) || value.length === 0) return [];
      const items = value.filter((v) => typeof v === "string" && v.trim()).map((v) => titleCase(String(v).trim()));
      // Combine short legal items into one title, split long lists
      if (items.length <= 2) {
        return [{ text: `${items.join(" | ")}`, category: label }];
      }
      return items.map((item) => ({ text: `${item}`, category: label }));
    }
    case "plantation": {
      if (!Array.isArray(value) || value.length === 0) return [];
      const items = value
        .filter((v): v is { type: string; count?: number | null } => typeof v?.type === "string")
        .map((p) => {
          const name = titleCase(p.type.trim());
          return p.count ? `${p.count} ${name} Trees` : name;
        });
      return items.length > 0
        ? [{ text: `${items.join(", ")}`, category: label }]
        : [];
    }
    case "irrigation": {
      const s = String(value).trim();
      return s ? [{ text: `${titleCase(s)} Irrigation`, category: label }] : [];
    }
    case "distances": {
      if (!Array.isArray(value) || value.length === 0) return [];
      return value
        .filter((v): v is { place: string; km?: number | null } => typeof v?.place === "string")
        .slice(0, 3) // Max 3 distance entries
        .map((d) => ({
          text: d.km != null ? `${d.km} KM from ${titleCase(d.place.trim())}` : `Near ${titleCase(d.place.trim())}`,
          category: label,
        }));
    }
    case "nearbyLandmarks": {
      if (!Array.isArray(value) || value.length === 0) return [];
      const landmarks = value
        .filter((v) => typeof v === "string" && v.trim())
        .slice(0, 2)
        .map((v) => titleCase(String(v).trim()));
      return landmarks.length > 0
        ? [{ text: `Near ${landmarks.join(", ")}`, category: label }]
        : [];
    }
    case "additionalFeatures": {
      if (!Array.isArray(value) || value.length === 0) return [];
      return value
        .filter((v) => typeof v === "string" && v.trim().length > 3)
        .slice(0, 3)
        .map((v) => ({ text: `${titleCase(String(v).trim())}`, category: label }));
    }
    case "highlights": {
      if (!Array.isArray(value) || value.length === 0) return [];
      return value
        .filter((v) => typeof v === "string" && v.trim().length > 3)
        .slice(0, 3)
        .map((v) => ({ text: `${titleCase(String(v).trim())}`, category: label }));
    }
    default: {
      if (typeof value === "boolean") return value ? [{ text: `${titleCase(label)}`, category: label }] : [];
      if (typeof value === "string" || typeof value === "number") {
        const s = String(value).trim();
        return s.length > 2 ? [{ text: `${titleCase(s)}`, category: label }] : [];
      }
      if (Array.isArray(value)) {
        return value
          .filter((v) => typeof v === "string" && v.trim().length > 2)
          .slice(0, 2)
          .map((v) => ({ text: `${titleCase(String(v).trim())}`, category: label }));
      }
      return [];
    }
  }
}

/** Priority order for selecting the most impactful facts to show as titles. */
const FACT_PRIORITY_ORDER: string[] = [
  "propertyType",
  "location",
  "plotSize",
  "price",
  "highlights",
  "roadAccess",
  "water",
  "plantation",
  "legal",
  "distances",
  "electricity",
  "irrigation",
  "nearbyLandmarks",
  "additionalFeatures",
];

function buildTitleRowsFromFacts(facts: unknown, durationMs?: number): TitleRow[] {
  // If facts are already pre-built title rows (array with text fields), use them directly
  const existingRows = Array.isArray(facts)
    ? facts.filter((fact): fact is Partial<TitleRow> & { text: string } => typeof fact?.text === "string")
    : [];

  let texts: DraftTitleRow[];

  if (existingRows.length > 0) {
    texts = existingRows.map((fact) => ({
      id: typeof fact.id === "string" ? fact.id : undefined,
      text: fact.text,
      category: fact.category,
      startMs: typeof fact.startMs === "number" ? fact.startMs : undefined,
      endMs: typeof fact.endMs === "number" ? fact.endMs : undefined,
    }));
  } else if (facts && typeof facts === "object" && !Array.isArray(facts)) {
    // Build from structured facts object — use priority ordering
    const factsObj = facts as Record<string, unknown>;
    const allTitles: DraftTitleRow[] = [];

    for (const key of FACT_PRIORITY_ORDER) {
      if (!(key in factsObj)) continue;
      const entries = buildFactTitles(key, factsObj[key]);
      for (let i = 0; i < entries.length; i++) {
        allTitles.push({
          id: `${key}-${i}`,
          text: entries[i].text,
          category: entries[i].category,
        });
      }
    }

    // Also include any keys not in the priority list
    for (const [key, value] of Object.entries(factsObj)) {
      if (FACT_PRIORITY_ORDER.includes(key)) continue;
      if (key === "priceUnit") continue; // priceUnit is merged into price display
      const entries = buildFactTitles(key, value);
      for (let i = 0; i < entries.length; i++) {
        allTitles.push({
          id: `${key}-${i}`,
          text: entries[i].text,
          category: entries[i].category,
        });
      }
    }

    texts = allTitles;
  } else {
    texts = [];
  }

  // Filter out empty/meaningless entries, cap at 8
  const visibleTexts = texts.filter((row) => row.text.trim().length > 2).slice(0, 8);
  if (visibleTexts.length === 0) return [];

  const totalMs = Math.max(durationMs ?? 0, visibleTexts.length * 3000, 3000);
  const slotMs = Math.max(2500, Math.floor(totalMs / visibleTexts.length));

  const rows = visibleTexts.map((row, index) => ({
    id: row.id ?? `title-${index}`,
    text: row.text.trim(),
    category: row.category,
    startMs: row.startMs ?? index * slotMs,
    endMs: row.endMs ?? Math.min(totalMs, (row.startMs ?? index * slotMs) + slotMs),
  }));

  // Each title holds until the next one starts, last one to the end of the
  // video — so the titles run the full length of the subtitles rather than
  // appearing as isolated cards.
  return layoutFactTimings(rows, { totalDurationMs: totalMs });
}

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const FONT_COLOR_PRESETS = [
  "#ffffff",
  "#fbbf24",
  "#f87171",
  "#60a5fa",
  "#34d399",
  "#c084fc",
  "#fb923c",
  "#f472b6",
  "#e2e8f0",
  "#000000",
];

const TITLE_STYLE_PRESETS: Record<string, TitleStyle> = {
  raw_plain: {
    preset: "raw_plain",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 48,
    fontWeight: 400,
    color: "#ffffff",
    backgroundOpacity: 0,
    fontStyle: "normal",
    textDecoration: "none",
    letterSpacing: 0,
    shadow: false,
  },
  bold_orange: {
    preset: "bold_orange",
    fontFamily: "Montserrat, sans-serif",
    fontSize: 56,
    fontWeight: 900,
    color: "#f97316",
    backgroundOpacity: 0,
    fontStyle: "italic",
    textDecoration: "none",
    letterSpacing: 0,
    shadow: true,
  },
  clean_white: {
    preset: "clean_white",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 52,
    fontWeight: 800,
    color: "#ffffff",
    backgroundOpacity: 35,
    fontStyle: "normal",
    textDecoration: "none",
    letterSpacing: 0,
    shadow: true,
  },
  luxury_gold: {
    preset: "luxury_gold",
    fontFamily: "Playfair Display, serif",
    fontSize: 58,
    fontWeight: 800,
    color: "#fbbf24",
    backgroundOpacity: 25,
    fontStyle: "italic",
    textDecoration: "underline",
    letterSpacing: 1,
    shadow: true,
  },
  blue_modern: {
    preset: "blue_modern",
    fontFamily: "Poppins, sans-serif",
    fontSize: 54,
    fontWeight: 800,
    color: "#60a5fa",
    backgroundOpacity: 30,
    fontStyle: "normal",
    textDecoration: "none",
    letterSpacing: 2,
    shadow: true,
  },
};

export function SubtitleStudioPanel({
  projectId,
  audio,
}: {
  projectId: string;
  audio: AudioLike | null | undefined;
  onNext?: () => void;
}) {
  const addToast = useUIStore((s) => s.addToast);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [track, setTrack] = useState<TrackLike | null>(null);
  const [availableTracks, setAvailableTracks] = useState<{ id: string, language: string, stylePreset: string }[]>([]);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [stylePreset, setStylePreset] = useState("instagram_reels");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [mode, setMode] = useState<"subtitles" | "titles">("subtitles");
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [hasProjectFacts, setHasProjectFacts] = useState(false);
  const [, setCueSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [titleSaveState, setTitleSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, setStyleSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const cueDirtyRef = useRef(false);
  const titleDirtyRef = useRef(false);
  const styleDirtyRef = useRef(false);

  // Font customization state
  const [customFont, setCustomFont] = useState("Inter, system-ui, sans-serif");
  const [customFontSize, setCustomFontSize] = useState(28);
  const [customFontWeight, setCustomFontWeight] = useState(700);
  const [customColor, setCustomColor] = useState("#ffffff");
  const [customBgOpacity, setCustomBgOpacity] = useState(55);
  const [customWordHighlight, setCustomWordHighlight] = useState(true);
  const [customHighlightColor, setCustomHighlightColor] = useState("#fbbf24");
  const [presetHydratedFor, setPresetHydratedFor] = useState<string | null>(null);

  // Custom Title Presets
  const [customTitlePresets, setCustomTitlePresets] = useState<Record<string, TitleStyle>>({});
  useEffect(() => {
    try {
      const saved = localStorage.getItem("customTitlePresets");
      if (saved) setCustomTitlePresets(JSON.parse(saved));
    } catch { }
  }, []);

  const handleSaveCustomTitlePreset = () => {
    const name = window.prompt("Enter a name for this custom preset:");
    if (!name) return;
    const id = "custom_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const newPresets = { ...customTitlePresets, [id]: { ...titleStyle, preset: id } };
    setCustomTitlePresets(newPresets);
    localStorage.setItem("customTitlePresets", JSON.stringify(newPresets));
    addToast({ title: "Preset saved", type: "success" });
  };

  const [titleStyle, setTitleStyle] = useState<TitleStyle>(TITLE_STYLE_PRESETS.bold_orange);

  const updateTitles = (updater: (rows: TitleRow[]) => TitleRow[]) => {
    titleDirtyRef.current = true;
    setTitleSaveState("idle");
    setTitles(updater);
  };

  const markStyleDirty = () => {
    styleDirtyRef.current = true;
    setStyleSaveState("idle");
  };

  const hydrateStyleControls = useCallback((style: SubtitleStyle) => {
    setCustomFont(style.fontFamily);
    setCustomFontSize(style.fontSize);
    setCustomFontWeight(style.fontWeight);
    setCustomColor(style.color);
    const match = style.backgroundColor.match(/[\d.]+(?=\)$)/);
    setCustomBgOpacity(match ? Math.round(parseFloat(match[0]) * 100) : 55);
    setCustomWordHighlight(style.animation !== "none" && style.animation !== "fade");
    setCustomHighlightColor(style.highlightColor ?? "#fbbf24");
  }, []);

  const loadTrack = useCallback(async (trackIdToLoad?: string) => {
    let url = `/api/projects/${projectId}/subtitles`;
    const params = new URLSearchParams();
    if (trackIdToLoad) params.set("trackId", trackIdToLoad);
    if (audio?.id) params.set("audioAssetId", audio.id);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load subtitles");
    const t = json.track as TrackLike | null;
    cueDirtyRef.current = false;
    styleDirtyRef.current = false;
    setTrack(t);
    setCues(t?.cues ?? []);
    setStylePreset(t?.stylePreset ?? "instagram_reels");
    hydrateStyleControls(resolveSubtitleStyle(t?.stylePreset ?? "instagram_reels", t?.customStyle ?? null));
    if (json.tracks) setAvailableTracks(json.tracks);
  }, [projectId, audio, hydrateStyleControls]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadTrack();
      } catch {
        /* no track yet */
      } finally {
        setLoading(false);
      }
    })();
  }, [loadTrack]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projectRes, tlRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`, { cache: "no-store" }),
          fetch(`/api/projects/${projectId}/timeline`, { cache: "no-store" })
        ]);

        const projectJson = await projectRes.json();
        const facts = projectJson.project?.extractedFacts || [];

        const tlJson = await tlRes.json();
        const timeline = tlJson.timeline;

        let loadedTitles: TitleRow[] | null = null;
        let loadedStyle: TitleStyle | null = null;

        if (timeline && timeline.clips) {
          const clips = Object.values(timeline.clips) as any[];
          const titleClips = clips.filter(c => c.properties?.textOverlayMeta?.category === "title");
          if (titleClips.length > 0) {
            loadedTitles = titleClips.map(c => ({
              id: c.id.replace("title-", ""),
              text: String(c.properties.text ?? "").trim(),
              startMs: c.startTime,
              endMs: c.endTime,
              category: c.properties.textOverlayMeta?.factCategory
            })).sort((a, b) => a.startMs - b.startMs);

            if (titleClips[0].properties?.textOverlayMeta?.titleStyle) {
              loadedStyle = titleClips[0].properties.textOverlayMeta.titleStyle;
            }
          }
        }

        if (!cancelled) {
          if (loadedTitles && loadedTitles.length > 0) {
            setTitles(loadedTitles);
            if (loadedStyle) setTitleStyle(loadedStyle);
            titleDirtyRef.current = false;
          } else {
            const rows = buildTitleRowsFromFacts(facts, audio?.durationMs);
            if (rows.length > 0) {
              setTitles(rows);
              titleDirtyRef.current = true;
            } else {
              setTitles([]);
              titleDirtyRef.current = false;
            }
          }
          setHasProjectFacts(facts.length > 0);
        }
      } catch {
        /* titles are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, audio?.durationMs]);

  // Auto-generate subtitles when audio is ready and no cues exist
  const [autoGenFailed, setAutoGenFailed] = useState(false);

  useEffect(() => {
    if (loading || !audio || cues.length > 0 || busy || autoGenFailed) return;
    if (track !== null) return;

    let cancelled = false;

    const autoGenerate = async () => {
      setBusy("generate");
      try {
        const res = await fetch(
          `/api/projects/${projectId}/subtitles/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioAssetId: audio.id }),
          }
        );
        const json = await res.json();
        if (!res.ok) {
          addToast({ title: "Failed to sync subtitles", type: "error" });
          setAutoGenFailed(true);
          return;
        }
        if (cancelled) return;
        cueDirtyRef.current = false;
        styleDirtyRef.current = false;
        setTrack(json.track);
        setCues(json.track.cues);
        setStylePreset(json.track.stylePreset ?? "instagram_reels");
        hydrateStyleControls(resolveSubtitleStyle(json.track.stylePreset ?? "instagram_reels", json.track.customStyle ?? null));
        if (json.tracks) setAvailableTracks(json.tracks);
      } catch {
        setAutoGenFailed(true);
        addToast({ title: "Error syncing subtitles", type: "error" });
      } finally {
        if (!cancelled) setBusy(null);
      }
    };

    void autoGenerate();
    return () => {
      cancelled = true;
    };
  }, [audio, cues.length, busy, track, projectId, autoGenFailed, addToast, hydrateStyleControls, loading]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentMs(Math.round(el.currentTime * 1000));
    const onPlay = () => {
      setPlaying(true);
      setSelectedCueId(null); // Clear manual selection on play so preview tracks audio naturally
    };
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [audio?.r2Url, loading]);

  // Build preview style — merge preset + controls (matches what editor resolves)
  const previewStyle = useMemo<SubtitleStyle>(
    () => {
      const presetStyle = resolveSubtitleStyle(stylePreset, null);
      const isPresetHighlight = presetStyle.animation === "karaoke" || presetStyle.animation === "highlight" || presetStyle.animation === "word_pop";
      const finalAnimation = customWordHighlight
        ? (isPresetHighlight ? presetStyle.animation : "word_pop")
        : (isPresetHighlight ? "none" : presetStyle.animation);

      return {
        ...presetStyle,
        fontFamily: customFont,
        fontSize: customFontSize,
        fontWeight: customFontWeight,
        color: customColor,
        backgroundColor: `rgba(0,0,0,${customBgOpacity / 100})`,
        position: "bottom",
        animation: finalAnimation,
        highlightColor: customHighlightColor,
        stroke: true,
        strokeColor: "#000000",
        strokeWidth: 2,
        shadow: true,
      };
    },
    [customFont, customFontSize, customFontWeight, customColor, customBgOpacity, customWordHighlight, customHighlightColor, stylePreset]
  );

  const handleStylePresetChange = (key: string) => {
    markStyleDirty();
    setStylePreset(key);
    hydrateStyleControls(resolveSubtitleStyle(key, null));
  };

  const handleTitlePresetChange = (key: string) => {
    const preset = { ...TITLE_STYLE_PRESETS, ...customTitlePresets }[key];
    if (!preset) return;
    titleDirtyRef.current = true;
    setTitleSaveState("idle");
    setTitleStyle(preset);
  };

  const updateTitleStyle = (patch: Partial<TitleStyle>) => {
    titleDirtyRef.current = true;
    setTitleSaveState("idle");
    setTitleStyle((current) => ({ ...current, ...patch }));
  };

  const activeCue =
    cues.find((c) => currentMs >= c.startMs && currentMs < c.endMs) ??
    cues.find((c) => c.id === selectedCueId);
  const activeTitle = titles.find((title) => currentMs >= title.startMs && currentMs < title.endMs);

  const activeWordIndex =
    activeCue?.words.findIndex(
      (w) => currentMs >= w.startMs && currentMs < w.endMs
    ) ?? -1;

  const downloadSrt = () => {
    const blob = new Blob([cuesToSrt(cues)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subtitles-${projectId.slice(0, 8)}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const updateCue = (cueId: string, patch: Partial<SubtitleCue>) => {
    cueDirtyRef.current = true;
    setCueSaveState("idle");
    setCues((current) => current.map((cue) => cue.id === cueId ? { ...cue, ...patch } : cue));
  };

  const handleTranslate = async () => {
    if (!track) return;
    setBusy("translate");
    try {
      const res = await fetch(`/api/projects/${projectId}/subtitles/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });
      if (!res.ok) throw new Error("Translation failed");
      const json = await res.json();
      await loadTrack(json.track.id);
      addToast({ title: "Translated successfully", type: "success" });
    } catch {
      addToast({ title: "Translation failed", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateFacts = async () => {
    setBusy("extract_facts");
    try {
      const res = await fetch(`/api/projects/${projectId}/extract`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fact extraction failed");

      // /extract returns facts with no timing, which would leave the titles on
      // arbitrary even slots that drift away from what's being said. Align them
      // to the current subtitle cues so each title lands on its spoken line.
      let factsForTitles = json.facts;
      if (track) {
        try {
          const alignRes = await fetch(`/api/projects/${projectId}/facts/align`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackId: track.id }),
          });
          const alignJson = await alignRes.json();
          if (alignRes.ok && Array.isArray(alignJson.facts) && alignJson.facts.length > 0) {
            factsForTitles = alignJson.facts;
          }
        } catch {
          /* fall back to untimed facts */
        }
      }

      const rows = buildTitleRowsFromFacts(factsForTitles, audio?.durationMs);
      titleDirtyRef.current = rows.length > 0;
      setHasProjectFacts(rows.length > 0);
      setTitles(rows);
      setTitleSaveState("idle");
      addToast({ title: "Facts generated", type: "success" });
    } catch (error) {
      addToast({ title: error instanceof Error ? error.message : "Failed to generate facts", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!track || !cueDirtyRef.current || cues.length === 0) return;
    const timer = window.setTimeout(() => {
      setCueSaveState("saving");
      void (async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/subtitles`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackId: track.id, cues }),
          });
          if (!res.ok) throw new Error("Cue save failed");
          cueDirtyRef.current = false;
          setCueSaveState("saved");
        } catch {
          setCueSaveState("error");
        }
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [cues, projectId, track]);

  useEffect(() => {
    if (!track || !styleDirtyRef.current) return;
    const timer = window.setTimeout(() => {
      setStyleSaveState("saving");
      void (async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/subtitles`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              trackId: track.id,
              stylePreset,
              customStyle: previewStyle,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Style save failed");
          styleDirtyRef.current = false;
          setTrack((current) => current ? { ...current, stylePreset: json.track.stylePreset, customStyle: json.track.customStyle } : current);
          setStyleSaveState("saved");
        } catch {
          setStyleSaveState("error");
        }
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [previewStyle, projectId, stylePreset, track]);

  useEffect(() => {
    // No `titles.length` guard: with zero title rows the PUT is a style-only
    // save — the route restyles the timeline's existing title clips in place
    // (it no longer treats an empty list as "delete every title").
    if (!titleDirtyRef.current) return;
    const timer = window.setTimeout(() => {
      setTitleSaveState("saving");
      void (async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/titles`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ titles, titleStyle }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Title save failed");
          titleDirtyRef.current = false;
          setTitleSaveState("saved");
        } catch {
          setTitleSaveState("error");
        }
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [projectId, titleStyle, titles]);

  const seekToMs = (ms: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = ms / 1000;
      void audioRef.current.play();
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      setSelectedCueId(null); // Clear manual selection on play
      void audioRef.current.play();
    }
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
      {/* Toolbar */}
      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-1 w-fit">
        {(["subtitles", "titles"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMode(tab)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors",
              mode === tab ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {mode === "titles" ? (
        <div className="grid lg:grid-cols-[300px_1fr] gap-6">
          <div className="h-full relative">
            <Card className="shadow-sm overflow-hidden sticky top-24 z-10 h-fit">
              <CardContent className="p-0">
                <div className="relative aspect-[9/16] max-h-[480px] mx-auto bg-gradient-to-b from-slate-800 to-slate-900" style={{ maxWidth: 300 }}>
                  {(activeTitle ?? titles[0]) && (
                    <div
                      style={{
                        ...studioTitleInsetStyle(),
                        ...studioTitleBoxStyle(),
                        ...studioTitleTextStyle(titleStyle),
                      }}
                    >
                      {(activeTitle ?? titles[0]).text}
                    </div>
                  )}
                  {!activeTitle && titles.length > 0 && (
                    <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-slate-500">
                      Play audio to scrub through titles
                    </p>
                  )}
                  {audio && titles.length > 0 && (
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-colors"
                    >
                      {playing ? <Pause className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 text-white ml-0.5" />}
                    </button>
                  )}
                </div>
                {audio && (
                  <div className="p-4 border-t border-slate-100 space-y-2">
                    <audio
                      ref={audioRef}
                      src={audio.r2Url}
                      className="w-full"
                      controls
                      preload="metadata"
                      onTimeUpdate={(e) => setCurrentMs(Math.round(e.currentTarget.currentTime * 1000))}
                      onPlay={() => { setPlaying(true); setSelectedCueId(null); }}
                      onPause={() => setPlaying(false)}
                    />
                    <p className="text-xs text-slate-500 tabular-nums">
                      {formatClock(currentMs)} / {formatClock(audio.durationMs)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="shadow-sm overflow-hidden border-slate-200">
              <CardContent className="p-0">
                <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-slate-50 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <Palette className="w-4 h-4 text-indigo-500" />
                        Title Style
                      </h3>
                      {/* <p className="text-xs text-slate-500 mt-1">Titles are always positioned at the top.</p> */}
                    </div>
                    <Button size="sm" variant="outline" className="h-8 text-xs bg-white" onClick={handleSaveCustomTitlePreset}>
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Save preset
                    </Button>
                  </div>
                </div>

                <div className="space-y-5 p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                    {Object.entries({ ...TITLE_STYLE_PRESETS, ...customTitlePresets }).map(([key, preset]) => (
                      <div key={key} className="relative group">
                        <button
                          type="button"
                          onClick={() => handleTitlePresetChange(key)}
                          className={cn(
                            "w-full rounded-xl border p-2.5 text-left transition-all text-xs shadow-sm",
                            titleStyle.preset === key
                              ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          )}
                        >
                          <div className="h-12 rounded-lg flex items-center justify-center mb-2 bg-slate-900 overflow-hidden">
                            <div
                              style={{
                                ...studioTitleBoxStyle(1, 0.42),
                                ...studioTitleTextStyle({
                                  fontFamily: preset.fontFamily,
                                  fontSize: preset.fontSize,
                                  fontWeight: preset.fontWeight,
                                  color: preset.color,
                                  backgroundOpacity: preset.backgroundOpacity,
                                  fontStyle: preset.fontStyle,
                                  textDecoration: preset.textDecoration,
                                  letterSpacing: preset.letterSpacing,
                                  shadow: preset.shadow,
                                }, 0.42),
                              }}
                            >
                              {titleSampleForPreset(key)}
                            </div>
                          </div>
                          <span className="text-slate-700 font-medium capitalize truncate block">
                            {key.replace(/^custom_/, "").replace(/_/g, " ")}
                          </span>
                        </button>
                        {key.startsWith("custom_") && (
                          <button
                            type="button"
                            className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Delete this custom preset?")) {
                                const newPresets = { ...customTitlePresets };
                                delete newPresets[key];
                                setCustomTitlePresets(newPresets);
                                localStorage.setItem("customTitlePresets", JSON.stringify(newPresets));
                              }
                            }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-3">
                    <label className="text-xs font-medium text-slate-600">Font Family</label>
                    <FontPicker
                      defaultValue={titleStyle.fontFamily.split(",")[0]}
                      onValueChange={(val) => updateTitleStyle({ fontFamily: `${val}, sans-serif` })}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-600">Font Size</label>
                        <span className="text-xs tabular-nums text-slate-500">{titleStyle.fontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min={32}
                        max={84}
                        value={titleStyle.fontSize}
                        onChange={(e) => updateTitleStyle({ fontSize: Number(e.target.value) })}
                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-2">
                      <label className="text-xs font-medium text-slate-600">Font Weight</label>
                      <div className="flex gap-1.5">
                        {[
                          { value: 600, label: "Semi" },
                          { value: 700, label: "Bold" },
                          { value: 800, label: "Extra" },
                          { value: 900, label: "Black" },
                        ].map((w) => (
                          <button
                            key={w.value}
                            type="button"
                            onClick={() => updateTitleStyle({ fontWeight: w.value })}
                            className={cn(
                              "flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-all",
                              titleStyle.fontWeight === w.value
                                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            {w.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-2">
                    <label className="text-xs font-medium text-slate-600">Font Color</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {FONT_COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateTitleStyle({ color })}
                          className={cn(
                            "w-7 h-7 rounded-full border-2 transition-transform hover:scale-110",
                            titleStyle.color === color ? "border-indigo-500 scale-110" : "border-slate-200"
                          )}
                          style={{
                            backgroundColor: color,
                            boxShadow: color === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,0.1)" : undefined,
                          }}
                        />
                      ))}
                      <input
                        type="color"
                        value={titleStyle.color || "#ffffff"}
                        onChange={(e) => updateTitleStyle({ color: e.target.value })}
                        className="size-7 rounded cursor-pointer border border-slate-200"
                        title="Custom font color"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-600">Background Opacity</label>
                        <span className="text-xs tabular-nums text-slate-500">{titleStyle.backgroundOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={titleStyle.backgroundOpacity}
                        onChange={(e) => updateTitleStyle({ backgroundOpacity: Number(e.target.value) })}
                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-2">
                      <label className="text-xs font-medium text-slate-600">Text Style</label>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateTitleStyle({ fontStyle: titleStyle.fontStyle === "italic" ? "normal" : "italic" })}
                          className={cn(
                            "flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-all",
                            titleStyle.fontStyle === "italic"
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          Italic
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTitleStyle({ textDecoration: titleStyle.textDecoration === "underline" ? "none" : "underline" })}
                          className={cn(
                            "flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-all",
                            titleStyle.textDecoration === "underline"
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          Underline
                        </button>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-slate-500">Letter spacing</span>
                        <span className="text-xs tabular-nums text-slate-500">{titleStyle.letterSpacing}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={6}
                        value={titleStyle.letterSpacing}
                        onChange={(e) => updateTitleStyle({ letterSpacing: Number(e.target.value) })}
                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Fact title overlays</h3>
                    {/* <p className="text-xs text-slate-500 mt-1">Loaded from Details facts and fixed to the top in editor/export.</p> */}
                  </div>
                  <div className="flex items-center gap-2">
                    {titles.length > 0 && (
                      <span className={cn(
                        "text-xs font-medium",
                        titleSaveState === "error" ? "text-red-500" : "text-slate-500"
                      )}>
                        {titleSaveState === "saving" ? "Saving..." : titleSaveState === "error" ? "Autosave failed" : "Autosaves to editor"}
                      </span>
                    )}
                    {titles.length > 0 || hasProjectFacts ? (
                      <Button variant="outline" size="sm" onClick={handleGenerateFacts} disabled={busy === "extract_facts"}>
                        {busy === "extract_facts" ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                        Regenerate facts
                      </Button>
                    ) : (
                      <Button onClick={handleGenerateFacts} disabled={busy === "extract_facts"}>
                        {busy === "extract_facts" ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                        Generate facts
                      </Button>
                    )}
                  </div>
                </div>
                <ul className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {titles.map((title, index) => {
                    const isActive = currentMs >= title.startMs && currentMs < title.endMs;
                    return (
                      <li key={title.id} className={cn("grid grid-cols-[120px_1fr_auto] gap-3 rounded-xl border p-3", isActive ? "border-indigo-200 bg-indigo-50/60" : "border-slate-100 bg-slate-50/60")}>
                        <div className="grid grid-cols-2 gap-1">
                          <input className="h-8 rounded border px-2 text-xs" type="number" step="0.05" value={(title.startMs / 1000).toFixed(2)} onChange={(e) => updateTitles((rows) => rows.map((row, i) => i === index ? { ...row, startMs: Math.round(Number(e.target.value) * 1000) } : row))} />
                          <input className="h-8 rounded border px-2 text-xs" type="number" step="0.05" value={(title.endMs / 1000).toFixed(2)} onChange={(e) => updateTitles((rows) => rows.map((row, i) => i === index ? { ...row, endMs: Math.round(Number(e.target.value) * 1000) } : row))} />

                        </div>
                        <textarea className="min-h-12 resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-snug" rows={2} value={title.text} onChange={(e) => updateTitles((rows) => rows.map((row, i) => i === index ? { ...row, text: e.target.value } : row))} />
                        <button type="button" className="shrink-0 p-1 rounded hover:bg-indigo-100 transition-colors self-start" onClick={() => seekToMs(title.startMs)}>
                          <Play className="w-3 h-3 text-indigo-500" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {titles.length === 0 && <p className="text-sm text-slate-500">Generate facts to create title overlays from the Details text.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>

          <div className="flex flex-wrap items-center gap-2">

            <Button
              type="button"
              variant="secondary"
              disabled={cues.length === 0}
              onClick={downloadSrt}
            >
              <Download className="w-4 h-4" />
              Export SRT
            </Button>
            {cues.length > 0 && (
              <Badge variant="secondary" className="normal-case tracking-normal">
                {cues.length} cues synced
              </Badge>
            )}
            {availableTracks.length > 1 && (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs text-slate-500 font-medium">Language:</span>
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  {availableTracks.map(t => (
                    <button
                      key={t.id}
                      onClick={() => loadTrack(t.id)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize",
                        track?.id === t.id ? "bg-white shadow-sm text-indigo-600" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      {t.language.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {track && (
              <Button
                type="button"
                variant="outline"
                className="ml-auto bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                disabled={cues.length === 0 || busy === "translate"}
                onClick={handleTranslate}
              >
                {busy === "translate" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4 mr-2" />
                )}
                Translate to English (AI)
              </Button>
            )}

            {/* {onNext && (
          <Button
            type="button"
            onClick={onNext}
            className={cn(!track || availableTracks.some(t => t.language === "english") ? "ml-auto" : "ml-2")}
          >
            Next: Open Editor
          </Button>
        )} */}
          </div>

          <div className="grid lg:grid-cols-[300px_1fr] gap-6">
            {/* Left: Preview panel */}
            <div className="h-full relative">
              <Card className="shadow-sm overflow-hidden sticky top-24 z-10 h-fit">
                <CardContent className="p-0">
                  <div
                    className="relative aspect-[9/16] max-h-[480px] mx-auto bg-gradient-to-b from-slate-800 to-slate-900"
                    style={{ maxWidth: 300 }}
                  >
                    {activeCue && (
                      <div
                        style={{
                          ...studioSubtitleInsetStyle(),
                          ...studioSubtitleBoxStyle(),
                          ...studioSubtitleTextStyle(previewStyle),
                        }}
                      >
                        {previewStyle.animation === "karaoke" && activeCue.words.length > 0 ? (
                          activeCue.words.map((w, i) => (
                            <span
                              key={`${w.word}-${i}`}
                              style={{
                                transition: "color 150ms",
                                color: i === activeWordIndex ? previewStyle.highlightColor : undefined,
                              }}
                            >
                              {w.word}{" "}
                            </span>
                          ))
                        ) : previewStyle.animation === "word_pop" || previewStyle.animation === "highlight" ? (
                          activeCue.words.length > 0
                            ? activeCue.words.map((w, i) => (
                              <span
                                key={`${w.word}-${i}`}
                                style={{
                                  transition: "color 150ms, opacity 150ms",
                                  color: i === activeWordIndex ? previewStyle.highlightColor : undefined,
                                  opacity: previewStyle.animation === "word_pop" && i > activeWordIndex ? 0.45 : 1,
                                }}
                              >
                                {w.word}{" "}
                              </span>
                            ))
                            : activeCue.text
                        ) : (
                          activeCue.text
                        )}
                      </div>
                    )}
                    {!activeCue && cues.length > 0 && (
                      <p className="absolute bottom-12 left-0 right-0 text-center text-xs text-slate-500">
                        Play audio to preview cues
                      </p>
                    )}
                    {cues.length === 0 && !busy && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-xs text-slate-500 text-center px-4">
                          {audio ? "Generating subtitles from voiceover…" : "Generate a voiceover first to see subtitles"}
                        </p>
                      </div>
                    )}

                    {/* Play button overlay */}
                    {audio && cues.length > 0 && (
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-colors"
                      >
                        {playing ? (
                          <Pause className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                        )}
                      </button>
                    )}
                  </div>
                  {audio && (
                    <div className="p-4 border-t border-slate-100 space-y-2">
                      <audio
                        ref={audioRef}
                        src={audio.r2Url}
                        className="w-full"
                        controls
                        preload="metadata"
                        onTimeUpdate={(e) => setCurrentMs(Math.round(e.currentTarget.currentTime * 1000))}
                        onPlay={() => { setPlaying(true); setSelectedCueId(null); }}
                        onPause={() => setPlaying(false)}
                      />
                      <p className="text-xs text-slate-500 tabular-nums">
                        {formatClock(currentMs)} / {formatClock(audio.durationMs)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Controls */}
            <div className="space-y-4">
              {/* Style Presets */}
              <Card className="shadow-sm">
                <CardContent className="p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Palette className="w-4 h-4 text-indigo-500" />
                    Style Presets
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(SUBTITLE_STYLE_PRESETS).map(([key, style]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleStylePresetChange(key)}
                        className={cn(
                          "relative rounded-lg border p-3 text-left transition-all text-xs",
                          stylePreset === key
                            ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        )}
                      >
                        <div
                          className="h-8 rounded flex items-center justify-center mb-1.5"
                          style={{
                            background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: style.fontFamily,
                              fontSize: 10,
                              fontWeight: style.fontWeight,
                              color: style.color,
                              textShadow: style.shadow ? "0 1px 3px rgba(0,0,0,0.5)" : undefined,
                            }}
                          >
                            Sample
                          </span>
                        </div>
                        <span className="text-slate-700 font-medium capitalize">
                          {key.replace(/_/g, " ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Font Customization */}
              <Card className="shadow-sm">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <Type className="w-4 h-4 text-indigo-500" />
                      Font Customization
                    </h3>
                  </div>

                  {/* Font Family Picker */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600">Font Family</label>
                    <div className="relative">
                      <FontPicker
                        defaultValue={customFont.split(",")[0]}
                        onValueChange={(val) => { markStyleDirty(); setCustomFont(`${val}, sans-serif`); }}
                      />
                    </div>
                  </div>

                  {/* Font Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-600">Font Size</label>
                      <span className="text-xs tabular-nums text-slate-500">{customFontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={48}
                      value={customFontSize}
                      onChange={(e) => { markStyleDirty(); setCustomFontSize(Number(e.target.value)); }}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  {/* Font Weight */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600">Font Weight</label>
                    <div className="flex gap-1.5">
                      {[
                        { value: 400, label: "Regular" },
                        { value: 600, label: "Semi Bold" },
                        { value: 700, label: "Bold" },
                        { value: 800, label: "Extra Bold" },
                      ].map((w) => (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => { markStyleDirty(); setCustomFontWeight(w.value); }}
                          className={cn(
                            "flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-all",
                            customFontWeight === w.value
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Color */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600">Font Color</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {FONT_COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => { markStyleDirty(); setCustomColor(color); }}
                          className={cn(
                            "w-7 h-7 rounded-full border-2 transition-transform hover:scale-110",
                            customColor === color ? "border-indigo-500 scale-110" : "border-slate-200"
                          )}
                          style={{
                            backgroundColor: color,
                            boxShadow: color === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,0.1)" : undefined,
                          }}
                        />
                      ))}
                      <input
                        type="color"
                        value={customColor || "#ffffff"}
                        onChange={(e) => { markStyleDirty(); setCustomColor(e.target.value); }}
                        className="size-7 rounded cursor-pointer border border-slate-200 ml-1"
                        title="Custom font color"
                      />
                    </div>
                  </div>

                  {/* Background Opacity */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-600">Background Opacity</label>
                      <span className="text-xs tabular-nums text-slate-500">{customBgOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={customBgOpacity}
                      onChange={(e) => { markStyleDirty(); setCustomBgOpacity(Number(e.target.value)); }}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  {/* Word highlight */}
                  <div className="space-y-3 pt-1 border-t border-slate-100">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-700">Highlight words</label>
                        <p className="text-[11px] text-slate-500 mt-0.5">Animate each word as it is spoken</p>
                      </div>
                      <Switch
                        checked={customWordHighlight}
                        onCheckedChange={(on) => {
                          markStyleDirty();
                          setCustomWordHighlight(on);
                        }}
                      />
                    </div>
                    {customWordHighlight && (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-600">Highlight color</label>
                        <div className="flex flex-wrap gap-2">
                          {["#fbbf24", "#34d399", "#60a5fa", "#f472b6", "#fb923c", "#a78bfa", "#ffffff"].map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => { markStyleDirty(); setCustomHighlightColor(color); }}
                              className={cn(
                                "size-7 rounded-full border-2 transition-transform",
                                customHighlightColor === color ? "border-indigo-500 scale-110" : "border-slate-200"
                              )}
                              style={{ backgroundColor: color }}
                              aria-label={`Highlight color ${color}`}
                            />
                          ))}
                          <input
                            type="color"
                            value={customHighlightColor}
                            onChange={(e) => { markStyleDirty(); setCustomHighlightColor(e.target.value); }}
                            className="size-7 rounded cursor-pointer border border-slate-200"
                            title="Custom highlight color"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                </CardContent>
              </Card>

              {/* Editable Cue List */}
              <Card className="shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <Captions className="w-4 h-4 text-indigo-500" />
                      Phrase Cues ({cues.length})
                    </h3>
                  </div>

                  {cues.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {audio ? "Subtitles will appear here once synced." : "No voiceover available yet."}
                    </p>
                  ) : (
                    <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {cues.map((cue) => {
                        const isActive = currentMs >= cue.startMs && currentMs < cue.endMs;
                        return (
                          <li
                            key={cue.id}
                            id={`cue-${cue.id}`}
                            className={cn(
                              "rounded-xl border px-3 py-3 text-sm cursor-pointer transition-all",
                              isActive
                                ? "border-indigo-200 bg-indigo-50/60"
                                : selectedCueId === cue.id
                                  ? "border-indigo-100 bg-slate-50"
                                  : "border-slate-100 hover:bg-slate-50"
                            )}
                            onClick={() => {
                              setSelectedCueId(cue.id);
                              seekToMs(cue.startMs);
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div className="grid grid-cols-2 gap-1 shrink-0 w-28">
                                <input
                                  type="number"
                                  value={(cue.startMs / 1000).toFixed(2)}
                                  step="0.05"
                                  className="h-7 rounded border border-slate-200 px-1.5 text-[11px] tabular-nums"
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => updateCue(cue.id, { startMs: Math.max(0, Math.round(Number(e.target.value) * 1000)) })}
                                />
                                <input
                                  type="number"
                                  value={(cue.endMs / 1000).toFixed(2)}
                                  step="0.05"
                                  className="h-7 rounded border border-slate-200 px-1.5 text-[11px] tabular-nums"
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => updateCue(cue.id, { endMs: Math.max(cue.startMs + 100, Math.round(Number(e.target.value) * 1000)) })}
                                />
                                <span className="col-span-2 text-[10px] tabular-nums text-slate-400">
                                  {formatClock(cue.startMs)} → {formatClock(cue.endMs)}
                                </span>
                              </div>
                              <textarea
                                value={cue.text}
                                rows={2}
                                className={cn(
                                  "min-h-12 flex-1 resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm leading-snug text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100",
                                  isActive && "border-indigo-200 bg-indigo-50/50 text-indigo-950 font-medium"
                                )}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateCue(cue.id, { text: e.target.value })}
                              />
                              <button
                                type="button"
                                className="shrink-0 p-1 rounded hover:bg-indigo-100 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  seekToMs(cue.startMs);
                                }}
                              >
                                <Play className="w-3 h-3 text-indigo-500" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
