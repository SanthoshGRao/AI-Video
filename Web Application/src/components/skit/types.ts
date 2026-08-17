import { findStylePreset } from "@/lib/tts/voices";

/** How one detected character is voiced. Mirrors the fields the preview API + the
 * VoiceStylePreset ("avatar") store need. */
export interface CastAssignment {
  voiceName: string;
  languageCode: string;
  styleId: string | null;
  /** "" when no custom director's notes. */
  customInstructions: string;
  /** Name of the saved avatar this came from, purely for display. */
  presetName: string | null;
  /** Voice pitch modifier (-2: Deep, -1: Low, 0: Normal, +1: High/Funny, +2: Squeaky/Cartoon). */
  pitch?: number;
  /** Speaking pace modifier (0.7x Slow - 1.3x Fast). */
  pace?: number;
  /** Voice emotion/modulation mode (e.g. "normal", "funny", "excited", "dramatic", "sarcastic", "whispering", "robotic"). */
  emotion?: string;
  /** Voice energy level ("relaxed", "balanced", "high"). */
  energy?: string;
}

export interface VoiceStylePresetLike {
  id: string;
  name: string;
  geminiVoice: string;
  languageCode: string;
  styleId?: string | null;
  styleInstructions: string;
}

export interface CharacterBundleMember {
  characterName: string;
  voiceName: string;
  languageCode: string;
  styleId?: string | null;
  customInstructions?: string;
  presetName?: string | null;
  pitch?: number;
  pace?: number;
  emotion?: string;
  energy?: string;
}

export interface CharacterBundle {
  id: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  characters: CharacterBundleMember[];
}

/** Short human label for the assigned delivery ("Energetic Ad Read", "Custom", …). */
export function describeStyle(a: CastAssignment): string {
  const base = a.presetName
    ? a.presetName
    : a.customInstructions.trim()
    ? "Custom"
    : findStylePreset(a.styleId)?.label ?? "Voice default";

  const mods: string[] = [];
  if (a.pitch === 1) mods.push("High Pitch");
  else if (a.pitch === 2) mods.push("Cartoon Pitch");
  else if (a.pitch === -1) mods.push("Low Pitch");
  else if (a.pitch === -2) mods.push("Deep Pitch");

  if (a.emotion && a.emotion !== "normal") {
    const emoLabel = a.emotion.charAt(0).toUpperCase() + a.emotion.slice(1);
    mods.push(emoLabel);
  }

  if (mods.length > 0) {
    return `${base} (${mods.join(", ")})`;
  }
  return base;
}

/**
 * Per-speaker color, assigned by first-appearance order. Full literal class
 * strings so Tailwind's JIT keeps them.
 */
export const SPEAKER_COLORS = [
  { dot: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700 border-indigo-200", active: "border-indigo-300 bg-indigo-50/70", ring: "ring-indigo-400" },
  { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200", active: "border-rose-300 bg-rose-50/70", ring: "ring-rose-400" },
  { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", active: "border-emerald-300 bg-emerald-50/70", ring: "ring-emerald-400" },
  { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200", active: "border-amber-300 bg-amber-50/70", ring: "ring-amber-400" },
  { dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 border-sky-200", active: "border-sky-300 bg-sky-50/70", ring: "ring-sky-400" },
  { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-200", active: "border-violet-300 bg-violet-50/70", ring: "ring-violet-400" },
  { dot: "bg-teal-500", chip: "bg-teal-50 text-teal-700 border-teal-200", active: "border-teal-300 bg-teal-50/70", ring: "ring-teal-400" },
  { dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 border-orange-200", active: "border-orange-300 bg-orange-50/70", ring: "ring-orange-400" },
] as const;

export function speakerColor(index: number) {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

/** Distinct default voices handed out to characters as they're detected. */
export const DEFAULT_VOICE_ROTATION = [
  "Charon", "Kore", "Puck", "Aoede", "Fenrir",
  "Leda", "Enceladus", "Despina", "Algenib", "Gacrux",
] as const;

export function defaultVoiceForIndex(index: number): string {
  return DEFAULT_VOICE_ROTATION[index % DEFAULT_VOICE_ROTATION.length];
}

/** Built-in system Character Bundles (none by default) */
export const DEFAULT_CHARACTER_BUNDLES: CharacterBundle[] = [];
