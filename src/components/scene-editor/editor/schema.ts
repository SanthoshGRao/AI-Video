/**
 * Timeline schema. The export format is this exact shape, validated with Zod.
 * It is intentionally Remotion-friendly: every item has frame-independent
 * start/duration in seconds and absolute layer/track ordering.
 */
import { z } from "zod";

export const KeyframeSchema = z.object({
  t: z.number(), // seconds, relative to clip start
  v: z.number(),
  ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("linear"),
});

export const TransitionSchema = z.object({
  kind: z.enum(["fade", "crossfade", "slide", "wipe", "zoom"]),
  duration: z.number().min(0).default(0.5),
});

export const FilterSchema = z.object({
  brightness: z.number().default(0),
  contrast: z.number().default(0),
  saturation: z.number().default(0),
  preset: z.enum(["none", "vintage", "bw", "warm", "cool"]).default("none"),
});

export const BaseClipSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  start: z.number().min(0), // timeline time, seconds
  duration: z.number().min(0.01),
  /** Optional source trim for media clips */
  inPoint: z.number().min(0).default(0),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  /** Keyframes per animatable property */
  keyframes: z
    .object({
      x: z.array(KeyframeSchema).default([]),
      y: z.array(KeyframeSchema).default([]),
      scale: z.array(KeyframeSchema).default([]),
      rotation: z.array(KeyframeSchema).default([]),
      opacity: z.array(KeyframeSchema).default([]),
    })
    .default({ x: [], y: [], scale: [], rotation: [], opacity: [] }),
  transitionIn: TransitionSchema.optional(),
  transitionOut: TransitionSchema.optional(),
});

export const MediaClipSchema = BaseClipSchema.extend({
  kind: z.literal("media"),
  assetId: z.string(),
  mediaKind: z.enum(["video", "image"]),
  opacity: z.number().min(0).max(1).default(1),
  rotation: z.number().default(0),
  speed: z.number().positive().default(1),
  volume: z.number().min(0).max(2).default(1),
  filter: FilterSchema.default({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    preset: "none",
  }),
  crop: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .optional(),
});

export const TextStyleSchema = z.object({
  fontFamily: z.string().default("Inter"),
  fontSize: z.number().default(48),
  fontWeight: z.number().default(700),
  color: z.string().default("#ffffff"),
  background: z.string().optional(),
  align: z.enum(["left", "center", "right"]).default("center"),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().default(0),
  shadow: z.boolean().default(false),
  x: z.number().default(0.5), // 0..1 of canvas
  y: z.number().default(0.5),
});

export const TextClipSchema = BaseClipSchema.extend({
  kind: z.literal("text"),
  text: z.string(),
  style: TextStyleSchema,
  animation: z
    .enum(["none", "fade", "slide-up", "pop", "typewriter"])
    .default("fade"),
});

export const FactClipSchema = BaseClipSchema.extend({
  kind: z.literal("fact"),
  factKey: z.string(),
  text: z.string(),
  style: TextStyleSchema,
  animation: z
    .enum(["none", "fade", "slide-up", "pop", "typewriter"])
    .default("slide-up"),
});

export const SubtitleClipSchema = BaseClipSchema.extend({
  kind: z.literal("subtitle"),
  text: z.string(),
  cueId: z.string(),
  preset: z
    .enum(["instagram", "reels", "luxury", "minimal", "modern"])
    .default("modern"),
  words: z
    .array(
      z.object({ text: z.string(), start: z.number(), end: z.number() }),
    )
    .optional(),
});

export const AudioClipSchema = BaseClipSchema.extend({
  kind: z.literal("audio"),
  assetId: z.string(),
  role: z.enum(["voiceover", "music", "sfx"]).default("voiceover"),
  volume: z.number().min(0).max(2).default(1),
  fadeIn: z.number().min(0).default(0),
  fadeOut: z.number().min(0).default(0),
});

export const ClipSchema = z.discriminatedUnion("kind", [
  MediaClipSchema,
  TextClipSchema,
  FactClipSchema,
  SubtitleClipSchema,
  AudioClipSchema,
]);

export type Clip = z.infer<typeof ClipSchema>;
export type MediaClip = z.infer<typeof MediaClipSchema>;
export type TextClip = z.infer<typeof TextClipSchema>;
export type FactClip = z.infer<typeof FactClipSchema>;
export type SubtitleClip = z.infer<typeof SubtitleClipSchema>;
export type AudioClip = z.infer<typeof AudioClipSchema>;
export type Keyframe = z.infer<typeof KeyframeSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const TrackKindSchema = z.enum([
  "video",
  "image",
  "fact",
  "text",
  "subtitle",
  "audio",
]);
export type TrackKind = z.infer<typeof TrackKindSchema>;

export const TrackSchema = z.object({
  id: z.string(),
  kind: TrackKindSchema,
  name: z.string(),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  muted: z.boolean().default(false),
  height: z.number().default(56),
});
export type Track = z.infer<typeof TrackSchema>;

export const SceneSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.number(),
  duration: z.number(),
  /** ScriptSegment id this scene was generated from, if any */
  scriptSegmentId: z.string().optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const TimelineSchema = z.object({
  version: z.literal(1),
  projectId: z.string(),
  width: z.number().default(1920),
  height: z.number().default(1080),
  fps: z.number().default(30),
  duration: z.number().default(0),
  tracks: z.array(TrackSchema),
  clips: z.array(ClipSchema),
  scenes: z.array(SceneSchema).default([]),
});
export type Timeline = z.infer<typeof TimelineSchema>;

export function validateTimeline(value: unknown): Timeline {
  return TimelineSchema.parse(value);
}
