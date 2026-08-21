"use client";

import { useEffect, useState } from "react";

/**
 * Global titlebar drag strip for the frameless desktop window.
 *
 * The nav headers set `-webkit-app-region: drag` on themselves, but they
 * only exist on some routes (and only when NEXT_PUBLIC_DESKTOP_MODE was
 * baked into the build) — leaving whole pages with no way to move the
 * window. This strip is mounted once in the root layout and detects the
 * desktop shell at runtime (same pattern as DesktopWindowControls), so the
 * top edge of every page is always draggable.
 *
 * Kept thin (8px) so it never sits over interactive controls: buttons in
 * the navbars start ~10px down, and the window-control buttons mark
 * themselves `no-drag`, which geometrically subtracts them from the region
 * regardless of stacking order.
 */
export function DesktopDragRegion() {
  const [available, setAvailable] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const controls = window.desktopAPI?.windowControls;
    if (!controls) return;
    setAvailable(true);
    const offFullscreen = controls.onFullscreenChange(setFullscreen);
    return () => {
      offFullscreen();
    };
  }, []);

  // Nothing to drag while fullscreen (F11) — and the strip would eat
  // clicks on full-bleed content.
  if (!available || fullscreen) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[99] h-2"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    />
  );
}
