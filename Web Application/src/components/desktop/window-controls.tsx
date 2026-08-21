"use client";

import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";

/**
 * Custom window controls for the frameless desktop window (see
 * `frame: false` in Desktop Application/src/main.ts). Replaces the native
 * Windows titleBarOverlay, which repainted independently of the web content
 * and visibly flickered/misaligned on navigation.
 *
 * A persistent subtle strip stays visible at rest (so there's always a
 * visual cue a control zone exists there) and the icons themselves fade to
 * full strength on hover.
 */
export function DesktopWindowControls() {
  const [available, setAvailable] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const controls = window.desktopAPI?.windowControls;
    if (!controls) return;
    setAvailable(true);
    controls.isMaximized().then(setMaximized).catch(() => {});
    const offMaximized = controls.onMaximizedChange(setMaximized);
    const offFullscreen = controls.onFullscreenChange(setFullscreen);
    return () => {
      offMaximized();
      offFullscreen();
    };
  }, []);

  // Nothing to minimize/maximize while fullscreen (F11), and the bar would
  // just sit awkwardly over full-bleed content — hide it until F11 exits.
  if (!available || fullscreen) return null;

  const controls = window.desktopAPI!.windowControls!;

  return (
    <div
      className="fixed top-0 right-0 z-[100] flex h-9 w-[138px] items-stretch justify-end border-b border-l border-black/[0.06] bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.04]"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => controls.minimize()}
        className="flex w-[46px] items-center justify-center text-[var(--text-secondary,#71717a)] opacity-60 transition-all hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
      >
        <Minus className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={() => controls.toggleMaximize()}
        className="flex w-[46px] items-center justify-center text-[var(--text-secondary,#71717a)] opacity-60 transition-all hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
      >
        {maximized ? <Copy className="size-3" /> : <Square className="size-3" />}
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={() => controls.close()}
        className="flex w-[46px] items-center justify-center text-[var(--text-secondary,#71717a)] opacity-60 transition-all hover:bg-[#e81123] hover:text-white hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
