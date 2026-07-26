/**
 * timeline-evaluator.ts — resolves a `NativeProject` timeline into the exact
 * set of active visual layers at an explicit timestamp. This is the
 * deterministic "what's active right now" step the export renderer needs
 * (replacing filtergraph-builder.ts's single whole-timeline FFmpeg filter
 * graph): call resolveFrameAt() once per output frame and every layer it
 * returns is exactly what that frame should composite, in back-to-front
 * paint order.
 *
 * Framework-agnostic like model/types.ts — no Node/DOM APIs — so the same
 * function can be unit-tested standalone and later reused by a live native
 * preview if one is ever built on top of NativeProject.
 *
 * Transitions ARE applied here (see transitions.ts), baked into each layer's
 * resolved opacity/geometry/crop. They used to be skipped — which is why they
 * showed up in the editor preview but never in the exported video.
 */
import type { NativeClip, NativeProject, NativeTrack, EffectInstance } from "../model/types";
import { activeTransitionsAt, transitionLayerStyles, type TransitionLayerStyle } from "./transitions";

const TRACK_KIND_PRIORITY: Record<NativeTrack["kind"], number> = {
  audio: -1,
  voiceover: -1,
  video: 10,
  image: 20,
  overlay: 40,
  text: 70,
  subtitle: 100,
};

export interface ResolvedTransform {
  /** 0-100, percentage of canvas width/height. NativeClip.transform itself
   * is pixel-based against project.width/height — this is the normalized
   * form, see the conversion in resolveFrameAt() below. */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  rotationDeg: number;
  /** 0-1 */
  opacity: number;
}

export interface ResolvedVisualLayer {
  clipId: string;
  kind: Extract<NativeClip["kind"], "video" | "image" | "text" | "shape">;
  mediaAssetId?: string;
  /** Seconds into the source media to sample for this output frame — only
   * set for "video" layers (images have no time axis). */
  mediaTimeSec?: number;
  transform: ResolvedTransform;
  fit: "cover" | "contain" | "fill";
  effects: EffectInstance[];
  text?: NativeClip["text"];
  /** Paint order (ascending = back to front) — matches CLIP_LAYER_PRIORITY
   * in the web app's layer-priority.ts. During a transition the pair is
   * separated by a fractional bump so the incoming clip draws on top. */
  zOrder: number;
  /**
   * Fraction of the SOURCE to crop away from each edge, 0-100, when a
   * transition reveals the layer progressively (wipe). Absent means no crop.
   * Consumers must crop the sampled source, not just shrink the destination
   * box, or the image is squashed instead of revealed.
   */
  cropInsetPct?: { left: number; right: number };
}

export interface ResolvedFrame {
  timeSec: number;
  layers: ResolvedVisualLayer[];
}

const VISUAL_KINDS = new Set<NativeClip["kind"]>(["video", "image", "text", "shape"]);

function isVisualKind(kind: NativeClip["kind"]): kind is ResolvedVisualLayer["kind"] {
  return VISUAL_KINDS.has(kind);
}

/** Resolves every visual clip active at `timeSec`, sorted back-to-front. */
export function resolveFrameAt(project: NativeProject, timeSec: number): ResolvedFrame {
  const tracksById = new Map(project.tracks.map((t) => [t.id, t]));
  const layers: ResolvedVisualLayer[] = [];

  // Transition styles for this instant, keyed by clip id. Both sides of an
  // active transition genuinely overlap on the timeline, so both clips pass
  // the active-range test below and both get a real, live-decoded frame.
  const styleByClipId = new Map<string, TransitionLayerStyle>();
  for (const active of activeTransitionsAt(project, timeSec)) {
    const styles = transitionLayerStyles(active.transition.type, active.progress);
    styleByClipId.set(active.outgoing.id, styles.outgoing);
    styleByClipId.set(active.incoming.id, styles.incoming);
  }

  for (const clip of project.clips) {
    if (clip.visible === false) continue;
    if (timeSec < clip.startSec || timeSec >= clip.endSec) continue;
    if (!isVisualKind(clip.kind)) continue;

    const track = tracksById.get(clip.trackId);
    if (track?.hidden) continue;

    // NativeClip.transform.x/y/w/h are absolute PIXELS against the project's
    // own authoring canvas (project.width/height) — NOT 0-100 percentages.
    // Confirmed against real saved timelines (e.g. a full-bleed video clip
    // has size:{width:1080,height:1920} on a 1080x1920 project) and matches
    // how filtergraph-builder.ts (the older, proven-correct FFmpeg export
    // path) already treats this same field: `scale=${t.w}:${t.h}` and
    // `overlay=x=${t.x}:y=${t.y}` used as literal pixels, falling back to
    // the full canvas (W x H) when a clip has no transform. Normalizing to
    // a true 0-100 percentage here (rather than downstream) means every
    // consumer — decode-pipeline.ts's box sizing, the GPU compositor's wire
    // layers — can keep doing `(pct / 100) * exportCanvasSize` and get the
    // right answer even when the export resolution differs from the
    // project's authoring canvas.
    const t = clip.transform ?? { x: 0, y: 0, w: project.width, h: project.height, rotationDeg: 0, opacity: 1 };
    const playbackRate = clip.playbackRate ?? 1;
    const mediaTimeSec =
      clip.kind === "video"
        ? Math.max(0, (timeSec - clip.startSec) * playbackRate + (clip.mediaInSec ?? 0))
        : undefined;

    // Authored geometry, normalized to percentages of the canvas.
    let xPct = (t.x / project.width) * 100;
    let yPct = (t.y / project.height) * 100;
    let wPct = (t.w / project.width) * 100;
    let hPct = (t.h / project.height) * 100;
    let opacity = t.opacity;
    let zOrder = track ? (TRACK_KIND_PRIORITY[track.kind] ?? 50) : 50;

    // Bake the transition into this layer's geometry/opacity.
    const style = styleByClipId.get(clip.id);
    if (style) {
      opacity *= style.opacity;
      if (style.translateXPercent) xPct += (style.translateXPercent / 100) * wPct;
      if (style.scalePercent != null && style.scalePercent !== 100) {
        const scale = style.scalePercent / 100;
        const scaledW = wPct * scale;
        const scaledH = hPct * scale;
        // Scale about the layer's centre, matching the preview's
        // `transform-origin: center`.
        xPct -= (scaledW - wPct) / 2;
        yPct -= (scaledH - hPct) / 2;
        wPct = scaledW;
        hPct = scaledH;
      }
      zOrder += style.zOrderBump;
    }

    layers.push({
      clipId: clip.id,
      kind: clip.kind,
      mediaAssetId: clip.mediaAssetId,
      mediaTimeSec,
      transform: {
        xPct,
        yPct,
        wPct,
        hPct,
        rotationDeg: t.rotationDeg,
        opacity,
      },
      fit: clip.fit ?? "cover",
      effects: clip.effects ?? [],
      text: clip.text,
      zOrder,
      cropInsetPct: style?.cropInsetPercent,
    });
  }

  layers.sort((a, b) => a.zOrder - b.zOrder);
  return { timeSec, layers };
}

/** Every distinct (mediaAssetId, video-clip) pairing active at any point in
 * the project — the set of source clips the decode stage needs to be able
 * to produce frames for. Used to pre-spawn one decode process per clip
 * instance before the render loop starts (see decode-pipeline.ts). */
export function collectVideoClipInstances(project: NativeProject): NativeClip[] {
  return project.clips.filter(
    (c) => c.visible !== false && c.kind === "video" && c.mediaAssetId,
  );
}
