import type { Clip } from "@/lib/editor-v2/editor-data";
import type { StageElement, Transition } from "@/lib/editor-v2/editor-store";
import { PX_PER_SECOND } from "@/lib/editor-v2/editor-data";
import { assetManager } from "./asset-manager";
import { resolveActiveByTrack } from "./track-resolver";
import { compareClipPaintOrder, clipLayerPriority } from "@/lib/editor-v2/layer-priority";
import { activeTransitionsAtPlayhead } from "@/lib/editor-v2/transition-runtime";
import { transitionFrameStyles, toCssTransitionStyle } from "@/lib/editor-v2/transition-style";

export interface TransitionStyle {
  opacity?: number;
  transform?: string;
  clipPath?: string;
  transformOrigin?: string;
  filter?: string;
}

export interface CanvasRenderItem {
  clip: Clip;
  element: StageElement;
  assetId: string;
  mediaId: string;
  localTime: number;
  virtual: boolean;
  /** Optional transition-driven CSS overrides for this frame. */
  transitionStyle?: TransitionStyle;
  /**
   * Explicit stacking order, set only while a transition is active.
   *
   * Normal compositing stacks by clip KIND (video < image < text < subtitle),
   * which is right for layering but wrong mid-transition: an image→video
   * dissolve would paint the incoming video UNDERNEATH the still-opaque
   * outgoing image, so the transition appeared to do nothing and then snap.
   * During a transition the pair must stack by role — incoming above
   * outgoing — regardless of kind.
   */
  zIndexOverride?: number;
}

export interface CanvasRenderPlan {
  beforeFilterCount: number;
  afterFilterCount: number;
  activeClipIds: string[];
  renderedElementIds: string[];
  renderedItems: CanvasRenderItem[];
  duplicateClipIds: string[];
  duplicateElementIds: string[];
  clipAssetBindings: Array<{ clipId: string; assetId: string; elementId: string }>;
  /** Per-frame transition diagnostics — see `logCanvasRenderPlan`. */
  transitionDebug: TransitionDebugEntry[];
}

export interface TransitionDebugEntry {
  transitionId: string;
  kind: string;
  progress: number;
  windowStartSec: number;
  windowEndSec: number;
  durationSec: number;
  outgoingClipId: string;
  outgoingLocalTime: number;
  incomingClipId: string;
  incomingLocalTime: number;
}

function shortHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = Math.imul(31, hash) + value.charCodeAt(i) | 0;
  return Math.abs(hash).toString(36);
}

export function resolveAssetId(src?: string): string {
  if (!src) return "none";
  const rec = assetManager.all().find((a) =>
    a.originalUrl === src || a.proxyUrl === src || a.thumbnailUrl === src,
  );
  return rec?.assetId ?? `src:${shortHash(src)}`;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return Array.from(dupes);
}

function virtualElementForClip(clip: Clip): StageElement | null {
  if (clip.kind === "audio") return null;
  if (clip.kind === "image" || clip.kind === "video") {
    return {
      id: `virtual:${clip.id}`,
      kind: clip.kind,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      color: clip.color ?? "#ffffff",
      src: clip.src,
      opacity: 100,
      effect: "none",
    };
  }
  if (clip.kind === "text") {
    return {
      id: `virtual:${clip.id}`,
      kind: "text",
      x: 10,
      y: 40,
      w: 80,
      h: 20,
      rotation: 0,
      color: clip.color ?? "#ffffff",
      text: clip.name,
      fontSize: 64,
      fontWeight: 800,
      align: "center",
      opacity: 100,
    };
  }
  return {
    id: `virtual:${clip.id}`,
    kind: "rect",
    x: 20,
    y: 20,
    w: 60,
    h: 60,
    rotation: 0,
    color: clip.color ?? "#ffffff",
    opacity: 100,
    effect: "none",
  };
}

function buildItem(
  clip: Clip,
  elements: StageElement[],
  playhead: number,
): CanvasRenderItem | null {
  const linkedElement = clip.elementId ? elements.find((el) => el.id === clip.elementId) : undefined;
  const baseElement = linkedElement ?? virtualElementForClip(clip);
  if (!baseElement) return null;
  const element: StageElement = {
    ...baseElement,
    id: clip.elementId ?? baseElement.id,
    src: clip.src ?? baseElement.src,
    // The ELEMENT owns its colour; `clip.color` is the timeline strip's
    // swatch, not content.
    //
    // This used to be `clip.color ?? baseElement.color`, and since
    // timeline-sync.ts stamps every clip with `color: "#6366f1"` the ??
    // never fell through — so every text element rendered in that indigo
    // regardless of the colour the user picked in the Subtitle/Title studio.
    // The stored style was always correct (and the export, which reads the
    // timeline directly rather than this render plan, always rendered the
    // right colour), which is what made it look like the style "wasn't
    // saving" when in fact only the preview was wrong.
    //
    // `virtualElementForClip()` already falls back to `clip.color` itself
    // for clips with no linked element, so preferring the element's colour
    // here is correct for both cases.
    color: baseElement.color ?? clip.color,
  };
  const assetId = resolveAssetId(clip.src ?? element.src);
  const startTime = clip.start / PX_PER_SECOND;
  const localTime = Math.max(0, (playhead - startTime) * (clip.playbackRate ?? 1) + (clip.mediaStart ?? 0));
  return {
    clip,
    element,
    assetId,
    mediaId: `${clip.kind}:${clip.id}`,
    localTime,
    virtual: !linkedElement,
  };
}

/** Compute per-clip CSS overrides for an active transition. `progress` 0→1. */
function transitionStyles(
  kind: Transition["kind"],
  progress: number,
): { outgoing: TransitionStyle; incoming: TransitionStyle } {
  const { outgoing, incoming } = transitionFrameStyles(kind, progress);
  return { outgoing: toCssTransitionStyle(outgoing), incoming: toCssTransitionStyle(incoming) };
}

export function buildCanvasRenderPlan(
  clips: Clip[],
  elements: StageElement[],
  playhead: number,
  transitions: Transition[] = [],
): CanvasRenderPlan {
  const resolution = resolveActiveByTrack(clips, playhead);
  const activeClips = Array.from(resolution.active.values()).sort((a, b) => a.track - b.track);
  const renderedItems: CanvasRenderItem[] = [];
  const includedClipIds = new Set<string>();

  for (const clip of activeClips) {
    const item = buildItem(clip, elements, playhead);
    if (!item) continue;
    renderedItems.push(item);
    includedClipIds.add(clip.id);
  }

  // Apply transitions. Both clips of an active pair are genuinely overlapping
  // on the timeline now (see transition-runtime.ts), so both are inside their
  // own trimmed range and both get a real, live-decoded frame. The single
  // -clip-per-track resolver above only keeps one of them, so the other is
  // re-added here.
  const transitionDebug: TransitionDebugEntry[] = [];
  for (const pair of activeTransitionsAtPlayhead(transitions, clips, playhead)) {
    const { transition: tr, outgoing, incoming, progress, window } = pair;
    const styles = transitionStyles(tr.kind, progress);

    transitionDebug.push({
      transitionId: tr.id,
      kind: tr.kind,
      progress,
      windowStartSec: window.startSec,
      windowEndSec: window.endSec,
      durationSec: window.durationSec,
      outgoingClipId: outgoing.id,
      outgoingLocalTime: buildItem(outgoing, elements, playhead)?.localTime ?? -1,
      incomingClipId: incoming.id,
      incomingLocalTime: buildItem(incoming, elements, playhead)?.localTime ?? -1,
    });

    // Stack the pair by ROLE, not by kind — incoming always on top. Anchored
    // at the lower of the two kinds' priorities so a background pair stays
    // behind overlays/titles/subtitles.
    const pairBase = Math.min(clipLayerPriority(outgoing.kind), clipLayerPriority(incoming.kind));

    const ensure = (clip: Clip, style: TransitionStyle, zIndexOverride: number) => {
      const existingIdx = renderedItems.findIndex((i) => i.clip.id === clip.id);
      if (existingIdx >= 0) {
        renderedItems[existingIdx] = {
          ...renderedItems[existingIdx],
          transitionStyle: { ...renderedItems[existingIdx].transitionStyle, ...style },
          zIndexOverride,
        };
        return;
      }
      const item = buildItem(clip, elements, playhead);
      if (!item) return;
      renderedItems.push({ ...item, transitionStyle: style, zIndexOverride });
      includedClipIds.add(clip.id);
    };

    ensure(outgoing, styles.outgoing, pairBase);
    ensure(incoming, styles.incoming, pairBase + 1);
  }

  // Paint back → front: video behind, subtitles on top (kind-based, not track
  // id) — except for transition pairs, which stack by role via zIndexOverride.
  renderedItems.sort((a, b) => {
    const za = a.zIndexOverride ?? clipLayerPriority(a.clip.kind);
    const zb = b.zIndexOverride ?? clipLayerPriority(b.clip.kind);
    if (za !== zb) return za - zb;
    return compareClipPaintOrder(a.clip, b.clip);
  });

  return {
    beforeFilterCount: elements.length,
    afterFilterCount: renderedItems.length,
    activeClipIds: Array.from(includedClipIds),
    renderedElementIds: renderedItems.map((item) => item.element.id),
    renderedItems,
    duplicateClipIds: duplicateValues(clips.map((clip) => clip.id)),
    duplicateElementIds: duplicateValues(clips.map((clip) => clip.elementId).filter(Boolean) as string[]),
    clipAssetBindings: clips.map((clip) => ({
      clipId: clip.id,
      assetId: resolveAssetId(clip.src),
      elementId: clip.elementId ?? "none",
    })),
    transitionDebug,
  };
}

export function renderPlanSignature(plan: CanvasRenderPlan, playhead: number): string {
  return JSON.stringify({
    t: Math.round(playhead * 100) / 100,
    active: plan.activeClipIds,
    rendered: plan.renderedElementIds,
    bindings: plan.renderedItems.map((item) => [item.clip.id, item.element.id, item.assetId]),
    dupElements: plan.duplicateElementIds,
  });
}

/**
 * Per-frame transition tracing. Off unless you turn it on from the devtools
 * console — this runs on every playhead tick, so it must never log by default:
 *
 *   window.__TRANSITION_DEBUG = true
 *
 * Each line reports the timeline clock, which clips are live, the transition's
 * identity/type, its progress, and the source timestamp each side is being
 * decoded at — enough to see progress jumps, backwards steps, or a side stuck
 * on one frame without attaching a debugger.
 */
function transitionDebugEnabled(): boolean {
  return typeof window !== "undefined" && (window as { __TRANSITION_DEBUG?: boolean }).__TRANSITION_DEBUG === true;
}

export function logCanvasRenderPlan(plan: CanvasRenderPlan, playhead: number) {
  if (!transitionDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `[render-pipeline] t=${playhead.toFixed(3)}s items=${plan.renderedItems.length}` +
      (plan.transitionDebug.length ? ` transitions=${plan.transitionDebug.length}` : ""),
  );
  // eslint-disable-next-line no-console
  console.log(
    "active clips:",
    plan.renderedItems.map((i) => `${i.clip.kind}:${i.clip.id}@${i.localTime.toFixed(3)}s z=${i.zIndexOverride ?? "kind"}`),
  );
  for (const d of plan.transitionDebug) {
    // eslint-disable-next-line no-console
    console.log(
      `transition ${d.transitionId} [${d.kind}] progress=${d.progress.toFixed(4)} ` +
        `window=[${d.windowStartSec.toFixed(3)}..${d.windowEndSec.toFixed(3)}] dur=${d.durationSec.toFixed(3)}s | ` +
        `A ${d.outgoingClipId}@${d.outgoingLocalTime.toFixed(3)}s -> B ${d.incomingClipId}@${d.incomingLocalTime.toFixed(3)}s`,
    );
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}
