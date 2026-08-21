"use client";

import { useEffect, useState } from "react";

/**
 * True when running inside the Electron desktop shell.
 *
 * Seeds from the build-time NEXT_PUBLIC_DESKTOP_MODE flag so SSR and the
 * first client render agree (no hydration mismatch in packaged builds),
 * then upgrades to true at runtime when the preload bridge is present —
 * covering builds where the NEXT_PUBLIC_ flag wasn't baked in. Use this
 * for shell-only *styling* (drag regions, reserved window-control space);
 * anything that changes which components render (e.g. the Clerk vs local
 * user menu) must keep using the build-time flag directly.
 */
export function useDesktopShell() {
  const [isDesktop, setIsDesktop] = useState(
    !!process.env.NEXT_PUBLIC_DESKTOP_MODE
  );

  useEffect(() => {
    if (window.desktopAPI) setIsDesktop(true);
  }, []);

  return isDesktop;
}
