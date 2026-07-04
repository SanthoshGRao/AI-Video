"use client";

import type { TransitionId } from "@/lib/editor-v2/editor-store";

const DURATION = "5.5s";

const PREVIEW_CSS = `
@keyframes tp-fade-out { 0%,30% { opacity:1 } 50%,100% { opacity:0 } }
@keyframes tp-fade-in { 0%,30% { opacity:0 } 50%,100% { opacity:1 } }
@keyframes tp-dissolve-out { 0%,25% { opacity:1 } 55%,100% { opacity:0 } }
@keyframes tp-dissolve-in { 0%,25% { opacity:0 } 55%,100% { opacity:1 } }
@keyframes tp-slide-out { 0%,30% { transform:translateX(0) } 50%,100% { transform:translateX(-100%) } }
@keyframes tp-slide-in { 0%,30% { transform:translateX(100%) } 50%,100% { transform:translateX(0) } }
@keyframes tp-wipe-out { 0%,30% { clip-path:inset(0 0 0 0) } 50%,100% { clip-path:inset(0 100% 0 0) } }
@keyframes tp-wipe-in { 0%,30% { clip-path:inset(0 0 0 100%) } 50%,100% { clip-path:inset(0 0 0 0) } }
@keyframes tp-zoom-out { 0%,30% { transform:scale(1); opacity:1 } 50%,100% { transform:scale(1.35); opacity:0 } }
@keyframes tp-zoom-in { 0%,30% { transform:scale(0.65); opacity:0 } 50%,100% { transform:scale(1); opacity:1 } }
@keyframes tp-flip-out { 0%,30% { transform:perspective(120px) rotateY(0deg); opacity:1 } 50%,100% { transform:perspective(120px) rotateY(90deg); opacity:0 } }
@keyframes tp-flip-in { 0%,30% { transform:perspective(120px) rotateY(-90deg); opacity:0 } 50%,100% { transform:perspective(120px) rotateY(0deg); opacity:1 } }
`;

const OUT_ANIM: Record<TransitionId, string> = {
  fade: `tp-fade-out ${DURATION} ease-in-out infinite`,
  dissolve: `tp-dissolve-out ${DURATION} ease-in-out infinite`,
  slide: `tp-slide-out ${DURATION} ease-in-out infinite`,
  wipe: `tp-wipe-out ${DURATION} ease-in-out infinite`,
  zoom: `tp-zoom-out ${DURATION} ease-in-out infinite`,
  flip: `tp-flip-out ${DURATION} ease-in-out infinite`,
};

const IN_ANIM: Record<TransitionId, string> = {
  fade: `tp-fade-in ${DURATION} ease-in-out infinite`,
  dissolve: `tp-dissolve-in ${DURATION} ease-in-out infinite`,
  slide: `tp-slide-in ${DURATION} ease-in-out infinite`,
  wipe: `tp-wipe-in ${DURATION} ease-in-out infinite`,
  zoom: `tp-zoom-in ${DURATION} ease-in-out infinite`,
  flip: `tp-flip-in ${DURATION} ease-in-out infinite`,
};

let stylesInjected = false;

function ensurePreviewStyles() {
  if (typeof document === "undefined" || stylesInjected) return;
  const el = document.createElement("style");
  el.setAttribute("data-transition-preview", "");
  el.textContent = PREVIEW_CSS;
  document.head.appendChild(el);
  stylesInjected = true;
}

export function TransitionPreview({ kind }: { kind: TransitionId }) {
  ensurePreviewStyles();
  return (
    <div className="size-9 shrink-0 rounded-md overflow-hidden relative ring-1 ring-white/10 bg-zinc-950">
      <div
        className="absolute inset-0 bg-gradient-to-br from-sky-400 to-blue-600"
        style={{ animation: OUT_ANIM[kind], transformOrigin: "center" }}
      />
      <div
        className="absolute inset-0 bg-gradient-to-br from-violet-500 to-fuchsia-600"
        style={{ animation: IN_ANIM[kind], transformOrigin: "center" }}
      />
    </div>
  );
}
