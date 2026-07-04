/**
 * Phase 1 — Integration Layer.
 *
 * Central synchronization layer. Components NEVER talk to each other directly.
 *
 *   Playback Engine
 *        ↓
 *   Integration Layer
 *        ↓
 *   Timeline   Canvas   Preview   Debug HUD
 *   Future Audio Engine   Future Subtitle Engine   Future Export Engine
 *
 * Responsibilities:
 *   - Push engine ticks → legacy store + core store (one writer of time).
 *   - Mirror project changes → playback duration + active-clip cache.
 *   - Bridge legacy `playing` toggle → engine play/pause.
 *   - Attach the Media Sync Controller for the active scene.
 *   - Maintain a Sync Watchdog snapshot for the Debug HUD.
 */

import { useEditor } from "@/lib/editor-v2/editor-store";
import { useEditorCore } from "./store";
import { playback } from "./playback";
import { mediaSync } from "./media-sync";
import { activeClipWindow, timelineDuration } from "./selectors";
import { validateProject, type ValidationReport } from "./validator";
import { eventBus } from "./event-bus";
import { preloader } from "./preloader";
import { startLegacyBridge } from "./legacy-bridge";

interface SyncSample {
  engineTime: number;
  legacyTime: number;
  coreTime: number;
  driftMs: number;
  inSync: boolean;
  fps: number;
  renderTimeMs: number;
  lastValidation: ValidationReport | null;
  activeClipCount: number;
  updatedAt: number;
}

const TOLERANCE_FRAMES = 1;

let started = false;
let cleanupFns: Array<() => void> = [];
let lastFrameAt = 0;
let frameMs = 16.7;
let watchdog: SyncSample = {
  engineTime: 0,
  legacyTime: 0,
  coreTime: 0,
  driftMs: 0,
  inSync: true,
  fps: 0,
  renderTimeMs: 0,
  lastValidation: null,
  activeClipCount: 0,
  updatedAt: 0,
};
const watchdogListeners = new Set<() => void>();

function publishWatchdog() {
  for (const l of watchdogListeners) {
    try {
      l();
    } catch {
      /* noop */
    }
  }
}

export const syncWatchdog = {
  subscribe: (l: () => void) => {
    watchdogListeners.add(l);
    return () => watchdogListeners.delete(l);
  },
  getSnapshot: (): SyncSample => watchdog,
};

export function startIntegration() {
  if (started || typeof window === "undefined") return;
  started = true;
  cleanupFns = [];

  startLegacyBridge();

  // 1) Engine ticks are the only writer of time
  cleanupFns.push(playback.onTick((t) => {
    const start = performance.now();
    const legacy = useEditor.getState();
    const core = useEditorCore.getState();
    if (Math.abs(legacy.playhead - t) > 1e-4) legacy.setPlayhead(t);
    if (Math.abs(core.playhead - t) > 1e-4) core.setPlayhead(t);
    const end = performance.now();
    const now = end;
    const dt = lastFrameAt ? now - lastFrameAt : 16.7;
    lastFrameAt = now;
    frameMs = frameMs * 0.85 + dt * 0.15;
    const driftLegacy = Math.abs(useEditor.getState().playhead - t) * 1000;
    const driftCore = Math.abs(useEditorCore.getState().playhead - t) * 1000;
    const drift = Math.max(driftLegacy, driftCore);
    const frameBudgetMs = (1000 / Math.max(1, playback.getFps())) * TOLERANCE_FRAMES;
    watchdog = {
      engineTime: t,
      legacyTime: useEditor.getState().playhead,
      coreTime: useEditorCore.getState().playhead,
      driftMs: drift,
      inSync: drift <= frameBudgetMs,
      fps: 1000 / Math.max(1, frameMs),
      renderTimeMs: end - start,
      lastValidation: watchdog.lastValidation,
      activeClipCount: watchdog.activeClipCount,
      updatedAt: now,
    };
    publishWatchdog();
  }));

  // 2) Mirror legacy `playing` toggle → engine
  let lastLegacyPlaying = useEditor.getState().playing;
  cleanupFns.push(useEditor.subscribe((s) => {
    if (s.playing !== lastLegacyPlaying) {
      lastLegacyPlaying = s.playing;
      s.playing ? playback.play() : playback.pause();
    }
  }));

  // 3) Mirror legacy setPlayhead (when paused) → engine seek
  let lastLegacyPlayhead = useEditor.getState().playhead;
  cleanupFns.push(useEditor.subscribe((s) => {
    if (s.playing) return;
    if (Math.abs(s.playhead - lastLegacyPlayhead) > 1e-4) {
      lastLegacyPlayhead = s.playhead;
      if (Math.abs(playback.getTime() - s.playhead) > 1e-3) playback.seek(s.playhead);
    }
  }));

  // 3.5) Mirror legacy settings.fps → engine
  let lastFps = useEditor.getState().settings.fps;
  playback.setFps(lastFps);
  cleanupFns.push(useEditor.subscribe((s) => {
    if (s.settings.fps !== lastFps) {
      lastFps = s.settings.fps;
      playback.setFps(lastFps);
    }
  }));

  // 4) Project shape → duration, validation, media sync
  const recomputeProject = () => {
    const core = useEditorCore.getState();
    const dur = timelineDuration(core.project);
    if (Math.abs(playback.getDuration() - dur) > 1e-4) playback.setDuration(dur);
    activeClipWindow.invalidate();
    mediaSync.update(core.project, core.activeSceneId);
    // Phase 3 — keep prev/current/next scenes warm.
    preloader.preloadForScene(core.project, core.activeSceneId);
    const report = validateProject(core.project);
    watchdog = {
      ...watchdog,
      lastValidation: report,
      activeClipCount: activeClipWindow.get(core.project, core.activeSceneId, playback.getTime())
        .clips.length,
    };
    publishWatchdog();
  };

  cleanupFns.push(useEditorCore.subscribe((s, prev) => {
    if (s.project !== prev.project || s.activeSceneId !== prev.activeSceneId) {
      recomputeProject();
    }
  }));

  // Initial attach
  const core = useEditorCore.getState();
  playback.setDuration(timelineDuration(core.project));
  mediaSync.attach(core.project, core.activeSceneId);
  recomputeProject();

  eventBus.emit("PROJECT_LOADED", { projectId: core.project.id });
}

export function stopIntegration() {
  if (!started) return;
  started = false;
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  mediaSync.detach();
}

/** Force media pool + playback duration to catch up after project hydration. */
export function resyncMedia() {
  if (!started || typeof window === "undefined") return;
  const core = useEditorCore.getState();
  const dur = timelineDuration(core.project);
  if (Math.abs(playback.getDuration() - dur) > 1e-4) playback.setDuration(dur);
  activeClipWindow.invalidate();
  mediaSync.update(core.project, core.activeSceneId);
  playback.seek(useEditor.getState().playhead);
}

if ((import.meta as any).hot) {
  (import.meta as any).hot.dispose(() => {
    stopIntegration();
  });
}
