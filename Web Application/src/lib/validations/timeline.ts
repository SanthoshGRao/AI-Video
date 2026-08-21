import { z } from "zod";

const clipSchema = z.object({
  id: z.string().min(1),
  trackId: z.string().min(1),
  mediaAssetId: z.string().optional(),
  audioAssetId: z.string().optional(),
  subtitleTrackId: z.string().optional(),
  type: z.enum(["video", "image", "audio", "text", "subtitle", "shape"]),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  trimStart: z.number().min(0).default(0),
  trimEnd: z.number().min(0).default(0),
  properties: z.record(z.string(), z.unknown()).default({}),
});

const trackSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["video", "audio", "voiceover", "text", "subtitle"]),
  name: z.string().min(1),
  muted: z.boolean(),
  locked: z.boolean(),
  clipIds: z.array(z.string()),
});

const settingsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  fps: z.number().positive().max(120),
  durationMs: z.number().positive(),
  backgroundColor: z.string().optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"),
  subtitleTrackId: z.string().optional(),
  // Media panel contents (incl. global-library imports) — zod strips unknown
  // keys, so this must be declared here or it silently never persists.
  projectMediaIds: z.array(z.string()).optional(),
});

const transitionSchema = z.object({
  id: z.string(),
  type: z.enum(["fade", "zoom", "slide", "blur", "push", "wipe", "flip"]),
  clipAId: z.string(),
  clipBId: z.string(),
  durationMs: z.number().int().positive(),
});

const textLayerSchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  style: z.record(z.string(), z.unknown()).default({}),
  animation: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
});

export const saveTimelineBodySchema = z.object({
  tracks: z.array(trackSchema).min(1),
  clips: z.record(z.string(), clipSchema),
  transitions: z.array(transitionSchema).default([]),
  textLayers: z.array(textLayerSchema).default([]),
  settings: settingsSchema,
  isAutosave: z.boolean().optional(),
  bumpVersion: z.boolean().optional(),
});

export const initTimelineBodySchema = z.object({
  replaceExisting: z.boolean().optional(),
});

export const generateTimelineBodySchema = z.object({
  scriptVersionId: z.string().optional(),
  audioAssetId: z.string().optional(),
  replaceExisting: z.boolean().optional(),
});
