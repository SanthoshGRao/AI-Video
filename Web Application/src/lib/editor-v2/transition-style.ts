import type { TransitionId } from "./editor-store";

/**
 * Structured (render-target-agnostic) transition frame values. DOM consumers
 * turn this into CSS (see `toCssTransitionStyle`); the export `Compositor`
 * (2D canvas — no clip-path/3D transforms) applies these fields directly with
 * ctx calls. Keeping one source of truth here is what keeps the editor's live
 * preview and the exported video's transitions visually identical.
 */
export interface TransitionFrameStyle {
  opacity: number;
  translateXPercent?: number;
  scalePercent?: number; // 100 = no scale
  clipInsetPercent?: { left: number; right: number };
  rotateYDeg?: number;
  centerOrigin?: boolean;
}

export interface TransitionCssStyle {
  opacity?: number;
  transform?: string;
  clipPath?: string;
  transformOrigin?: string;
}

function clamp01(p: number): number {
  return Math.max(0, Math.min(1, p));
}

/** Per-clip frame values for an active transition. `progress` runs 0→1. */
export function transitionFrameStyles(
  kind: TransitionId,
  progress: number,
): { outgoing: TransitionFrameStyle; incoming: TransitionFrameStyle } {
  const p = clamp01(progress);
  switch (kind) {
    case "fade":
    case "dissolve":
      return {
        outgoing: { opacity: 1 },
        incoming: { opacity: p },
      };
    case "slide":
      return {
        outgoing: { opacity: 1, translateXPercent: -100 * p },
        incoming: { opacity: 1, translateXPercent: 100 * (1 - p) },
      };
    case "wipe":
      return {
        outgoing: { opacity: 1, clipInsetPercent: { left: 0, right: 100 * p } },
        incoming: { opacity: 1, clipInsetPercent: { left: 100 * (1 - p), right: 0 } },
      };
    case "zoom":
      // The outgoing clip stays fully opaque and the incoming one fades in ON
      // TOP of it, so the composite is exactly mix(A, B, p). Fading BOTH (the
      // old `1 - p` here) let the background show through at the midpoint —
      // a visible dip to black halfway through every zoom transition.
      return {
        outgoing: { opacity: 1, scalePercent: 100 + 40 * p, centerOrigin: true },
        incoming: { opacity: p, scalePercent: 60 + 40 * p, centerOrigin: true },
      };
    case "flip":
      return {
        outgoing: { opacity: 1 - p, rotateYDeg: 90 * p, centerOrigin: true },
        incoming: { opacity: p, rotateYDeg: -90 * (1 - p), centerOrigin: true },
      };
    default:
      return { outgoing: { opacity: 1 - p }, incoming: { opacity: p } };
  }
}

/** Convert structured frame values into a CSS-consumable style (DOM path). */
export function toCssTransitionStyle(s: TransitionFrameStyle): TransitionCssStyle {
  const transforms: string[] = [];
  if (s.translateXPercent != null) transforms.push(`translateX(${s.translateXPercent}%)`);
  if (s.scalePercent != null) transforms.push(`scale(${s.scalePercent / 100})`);
  if (s.rotateYDeg != null) transforms.push(`perspective(1000px) rotateY(${s.rotateYDeg}deg)`);
  return {
    opacity: s.opacity,
    transform: transforms.length ? transforms.join(" ") : undefined,
    clipPath: s.clipInsetPercent
      ? `inset(0 ${s.clipInsetPercent.right}% 0 ${s.clipInsetPercent.left}%)`
      : undefined,
    transformOrigin: s.centerOrigin ? "center" : undefined,
  };
}
