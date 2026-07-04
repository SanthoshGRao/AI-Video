import type { LucideIcon } from "lucide-react";
import {
  Image, Type, Music, Shapes, Library,
  Sticker, Film, Sparkles, LayoutTemplate, FolderOpen,
} from "lucide-react";
import type { EffectId, TransitionId } from "./editor-store";

export const PX_PER_SECOND = 20;

export type ToolId =
  | "media"
  | "library"
  | "templates"
  | "text"
  | "shapes"
  | "stickers"
  | "audio"
  | "transitions"
  | "effects";

export const TOOLS: { id: ToolId; label: string; icon: LucideIcon }[] = [
  { id: "media",       label: "Media",       icon: Image },
  { id: "library",     label: "Library",     icon: Library },
  { id: "text",        label: "Text",        icon: Type },
  { id: "shapes",      label: "Shapes",      icon: Shapes },
  { id: "stickers",    label: "Stickers",    icon: Sticker },
  { id: "audio",       label: "Audio",       icon: Music },
  { id: "transitions", label: "Transitions", icon: Film },
  { id: "effects",     label: "Effects",     icon: Sparkles },
];

export type AspectId = "16:9" | "9:16" | "1:1" | "4:5";

export const ASPECTS: { id: AspectId; label: string; preset: string; w: number; h: number }[] = [
  { id: "16:9", label: "Landscape", preset: "YouTube",   w: 1920, h: 1080 },
  { id: "9:16", label: "Shorts",    preset: "Reels",     w: 1080, h: 1920 },
  { id: "1:1",  label: "Square",    preset: "Instagram", w: 1080, h: 1080 },
  { id: "4:5",  label: "Portrait",  preset: "Feed",      w: 1080, h: 1350 },
];

export type ClipKind = "video" | "audio" | "text" | "image" | "overlay" | "subtitle";
export type TrackKind = ClipKind;

export interface ClipAudio {
  volume?: number;
  muted?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  solo?: boolean;
}

export interface Clip {
  id: string;
  kind: ClipKind;
  name: string;
  start: number; // px on timeline
  width: number; // px on timeline
  track: number;
  thumb?: string;
  src?: string;
  mediaAssetId?: string;
  mediaKind?: "video" | "image" | "audio";
  /** linked stage element (text/shape/sticker/image/video) */
  elementId?: string;
  color?: string;
  /** seconds offset into the source media; used by video/audio trim & split */
  mediaStart?: number;
  /** per-clip mixer: video clips with sound and audio clips share this. */
  audio?: ClipAudio;
  frozen?: boolean;
  source?: "ai" | "user";
  sourceDuration?: number;
  waveform?: number[];
  playbackRate?: number;
}

export interface Track {
  id: number;
  kind: TrackKind;
  label: string;
  hidden?: boolean;
  muted?: boolean;
  locked?: boolean;
  volume?: number; // 0..1, used for audio tracks
}

export const TRACK_LABEL: Record<TrackKind, string> = {
  video: "Video",
  image: "Image",
  text: "Text",
  audio: "Audio",
  overlay: "Overlay",
  subtitle: "Subtitles",
};

export const INITIAL_TRACKS: Track[] = [
  { id: 1, kind: "video", label: "Video 1" },
  { id: 2, kind: "image", label: "Image 1" },
  { id: 3, kind: "text", label: "Text 1", locked: true },
  { id: 4, kind: "audio", label: "Audio 1", locked: true },
  { id: 5, kind: "subtitle", label: "Subtitles", locked: true },
];

// kept so legacy imports still resolve
export const TRACKS = INITIAL_TRACKS;

// Start empty — content is added by the user or hydrated (title/captions/voice).
export const INITIAL_CLIPS: Clip[] = [];

/* ---------------- Text presets ---------------- */
export const FONT_FAMILIES = [
  "Inter",
  "Montserrat",
  "Poppins",
  "Roboto",
  "Oswald",
  "Bebas Neue",
  "Playfair Display",
  "Outfit",
  "Lato",
  "Raleway",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Trebuchet MS",
  "Verdana",
];

export const TEXT_PRESETS: {
  label: string;
  text: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  color: string;
}[] = [
  { label: "Bold Title",  text: "BOLD TITLE", fontSize: 84, fontWeight: 900, fontFamily: "Impact", color: "#ffffff" },
  { label: "Headline",    text: "Headline",   fontSize: 64, fontWeight: 800, fontFamily: "Inter", color: "#ffffff" },
  { label: "Subtitle",    text: "Subtitle",   fontSize: 40, fontWeight: 600, fontFamily: "Inter", color: "#f5d76e" },
  { label: "Elegant",     text: "Elegant",    fontSize: 56, fontWeight: 500, fontFamily: "Georgia", color: "#ffffff" },
  { label: "Caption",     text: "Caption text", fontSize: 26, fontWeight: 500, fontFamily: "Inter", color: "#ffffff" },
  { label: "Quote",       text: "“A great quote”", fontSize: 44, fontWeight: 400, fontFamily: "Georgia", color: "#e2e8f0" },
];

/* ---------------- Stickers / emoji ---------------- */
export const EMOJIS = [
  "🔥","✨","⭐","❤️","😍","😂","🎉","👍","💯","🚀","🏠","🔑",
  "💰","📈","🌟","🎬","🎵","💎","👏","🙌","😎","🤩","💡","📍",
  "✅","➡️","⬆️","🎯","🏆","🌈","☀️","🌙","⚡","💥","🎈","🎁",
];

/* ---------------- Effects (canvas filters) ---------------- */
export const EFFECTS: { id: EffectId; label: string; css: string }[] = [
  { id: "none",      label: "None",      css: "none" },
  { id: "grayscale", label: "Mono",      css: "grayscale(1)" },
  { id: "sepia",     label: "Sepia",     css: "sepia(0.85)" },
  { id: "blur",      label: "Soft Blur", css: "blur(3px)" },
  { id: "vintage",   label: "Vintage",   css: "sepia(0.4) contrast(1.1) saturate(1.3)" },
  { id: "vivid",     label: "Vivid",     css: "saturate(1.8) contrast(1.15)" },
  { id: "cool",      label: "Cool",      css: "hue-rotate(-15deg) saturate(1.2) brightness(1.05)" },
  { id: "warm",      label: "Warm",      css: "hue-rotate(15deg) saturate(1.3) brightness(1.05)" },
  { id: "invert",    label: "Invert",    css: "invert(1)" },
];

export function effectCss(id?: EffectId | null) {
  return EFFECTS.find((e) => e.id === (id ?? "none"))?.css ?? "none";
}

/* ---------------- Transitions ---------------- */
export const TRANSITIONS: {
  id: TransitionId;
  label: string;
  desc: string;
  gradient: string;
}[] = [
  { id: "fade",     label: "Fade",       desc: "Smooth opacity blend",  gradient: "from-slate-500 to-slate-700" },
  { id: "dissolve", label: "Dissolve",   desc: "Cross dissolve",        gradient: "from-indigo-500 to-violet-600" },
  { id: "slide",    label: "Slide",      desc: "Push from the side",    gradient: "from-sky-500 to-cyan-600" },
  { id: "wipe",     label: "Wipe",       desc: "Linear wipe reveal",    gradient: "from-emerald-500 to-teal-600" },
  { id: "zoom",     label: "Zoom",       desc: "Scale punch-in",        gradient: "from-amber-500 to-orange-600" },
  { id: "flip",     label: "Flip",       desc: "3D flip rotate",        gradient: "from-rose-500 to-pink-600" },
];

/* ---------------- Templates (applyable) ---------------- */
export interface TemplateElement {
  kind: "text" | "rect" | "ellipse" | "triangle";
  x: number; y: number; w: number; h: number;
  text?: string; color: string; fontSize?: number; fontWeight?: number; fontFamily?: string;
  align?: "left" | "center" | "right";
}
export interface Template {
  id: string;
  name: string;
  format: AspectId;
  gradient: string;
  bg: string; // canvas background css
  elements: TemplateElement[];
}

export const TEMPLATES: Template[] = [
  {
    id: "t1",
    name: "YouTube Intro · Pulse",
    format: "16:9",
    gradient: "from-violet-600 to-fuchsia-600",
    bg: "linear-gradient(135deg, #7c3aed, #db2777)",
    elements: [
      { kind: "text", x: 8, y: 38, w: 84, h: 20, text: "YOUR CHANNEL", color: "#ffffff", fontSize: 96, fontWeight: 900, fontFamily: "Impact", align: "left" },
      { kind: "text", x: 8, y: 60, w: 60, h: 10, text: "New video every week", color: "#f5d0fe", fontSize: 32, fontWeight: 500, align: "left" },
      { kind: "rect", x: 8, y: 56, w: 12, h: 1, color: "#ffffff" },
    ],
  },
  {
    id: "t2",
    name: "Reels Story · Bold",
    format: "9:16",
    gradient: "from-pink-600 to-rose-500",
    bg: "linear-gradient(160deg, #db2777, #f43f5e)",
    elements: [
      { kind: "text", x: 10, y: 30, w: 80, h: 24, text: "BIG\nNEWS", color: "#ffffff", fontSize: 120, fontWeight: 900, fontFamily: "Impact", align: "center" },
      { kind: "text", x: 12, y: 70, w: 76, h: 8, text: "Swipe up to learn more", color: "#ffe4e6", fontSize: 34, fontWeight: 600, align: "center" },
    ],
  },
  {
    id: "t3",
    name: "Podcast Clip · Wave",
    format: "1:1",
    gradient: "from-emerald-500 to-teal-500",
    bg: "linear-gradient(135deg, #10b981, #14b8a6)",
    elements: [
      { kind: "ellipse", x: 38, y: 18, w: 24, h: 24, color: "#ffffff" },
      { kind: "text", x: 10, y: 50, w: 80, h: 12, text: "Episode 042", color: "#ffffff", fontSize: 52, fontWeight: 800, align: "center" },
      { kind: "text", x: 12, y: 64, w: 76, h: 8, text: "The Future of Real Estate", color: "#d1fae5", fontSize: 28, fontWeight: 500, align: "center" },
    ],
  },
  {
    id: "t4",
    name: "Real Estate · Tour",
    format: "16:9",
    gradient: "from-amber-500 to-orange-600",
    bg: "linear-gradient(135deg, #0f172a, #334155)",
    elements: [
      { kind: "rect", x: 0, y: 72, w: 100, h: 28, color: "#f59e0b" },
      { kind: "text", x: 6, y: 76, w: 70, h: 10, text: "Luxury Villa · $2.4M", color: "#0f172a", fontSize: 48, fontWeight: 800, align: "left" },
      { kind: "text", x: 6, y: 88, w: 70, h: 6, text: "4 Bed · 3 Bath · Ocean View", color: "#1e293b", fontSize: 26, fontWeight: 500, align: "left" },
    ],
  },
  {
    id: "t5",
    name: "Education · Explainer",
    format: "16:9",
    gradient: "from-sky-500 to-indigo-600",
    bg: "linear-gradient(135deg, #0ea5e9, #4f46e5)",
    elements: [
      { kind: "text", x: 8, y: 14, w: 84, h: 12, text: "How it works", color: "#ffffff", fontSize: 60, fontWeight: 800, align: "left" },
      { kind: "ellipse", x: 10, y: 40, w: 14, h: 14, color: "#ffffff" },
      { kind: "text", x: 28, y: 44, w: 60, h: 8, text: "Step one — get started", color: "#e0e7ff", fontSize: 30, fontWeight: 500, align: "left" },
    ],
  },
  {
    id: "t6",
    name: "TikTok · Hook",
    format: "9:16",
    gradient: "from-violet-500 to-purple-700",
    bg: "linear-gradient(160deg, #8b5cf6, #6d28d9)",
    elements: [
      { kind: "text", x: 8, y: 22, w: 84, h: 30, text: "WAIT\nFOR IT…", color: "#ffffff", fontSize: 110, fontWeight: 900, fontFamily: "Impact", align: "center" },
      { kind: "rect", x: 20, y: 60, w: 60, h: 8, color: "#ffffff" },
      { kind: "text", x: 22, y: 61, w: 56, h: 6, text: "FOLLOW FOR MORE", color: "#6d28d9", fontSize: 30, fontWeight: 800, align: "center" },
    ],
  },
];

export interface Shortcut {
  id: string;
  keys: string;
  label: string;
  group: "Playback" | "Editing" | "Timeline" | "View" | "File";
}

export const SHORTCUTS: Shortcut[] = [
  { id: "play",       keys: "Space",            label: "Play / Pause",          group: "Playback" },
  { id: "prev",       keys: "←",                label: "Previous frame",        group: "Playback" },
  { id: "next",       keys: "→",                label: "Next frame",            group: "Playback" },
  { id: "home",       keys: "Home",             label: "Jump to start",         group: "Playback" },
  { id: "end",        keys: "End",              label: "Jump to end",           group: "Playback" },

  { id: "split",      keys: "S",                label: "Split clip at playhead", group: "Editing" },
  { id: "dup",        keys: "Ctrl + D",         label: "Duplicate clip",        group: "Editing" },
  { id: "del",        keys: "Delete",           label: "Delete selection",      group: "Editing" },
  { id: "undo",       keys: "Ctrl + Z",         label: "Undo",                  group: "Editing" },
  { id: "redo",       keys: "Ctrl + Shift + Z", label: "Redo",                  group: "Editing" },

  { id: "zoomIn",     keys: "Ctrl + =",         label: "Zoom in timeline",      group: "Timeline" },
  { id: "zoomOut",    keys: "Ctrl + -",         label: "Zoom out timeline",     group: "Timeline" },
  { id: "snap",       keys: "N",                label: "Toggle snapping",       group: "Timeline" },

  { id: "cmdk",       keys: "Ctrl + K",         label: "Command palette",       group: "View" },
  { id: "help",       keys: "?",                label: "Keyboard shortcuts",    group: "View" },

  { id: "save",       keys: "Ctrl + S",         label: "Save project",          group: "File" },
  { id: "export",     keys: "Ctrl + E",         label: "Export project",        group: "File" },
];
