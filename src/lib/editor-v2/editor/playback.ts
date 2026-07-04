/**
 * Phase 1 — Playback Engine.
 *
 * SOLE OWNER OF TIME during playback.
 *
 * - One requestAnimationFrame loop.
 * - Time in seconds (float).
 * - No React state — emits ticks via subscribers (useSyncExternalStore-friendly).
 * - Supports FPS quantization (24/30/60), loop, playback rate, frame stepping.
 * - Auto-pauses at duration.
 */

export type Fps = 24 | 30 | 60;

export interface PlaybackSnapshot {
  time: number;
  playing: boolean;
  rate: number;
  loop: boolean;
  fps: Fps;
  duration: number;
}

type Listener = () => void;
type TickListener = (time: number, dt: number) => void;

class PlaybackEngine {
  private _time = 0;
  private _playing = false;
  private _rate = 1;
  private _loop = false;
  private _fps: Fps = 30;
  private _duration = 0;

  private raf = 0;
  private lastNow = 0;
  private listeners = new Set<Listener>();
  private tickListeners = new Set<TickListener>();
  private snapshot: PlaybackSnapshot = this.computeSnapshot();

  /* ------------------------- public state ------------------------- */

  getSnapshot(): PlaybackSnapshot {
    return this.snapshot;
  }

  getTime() {
    return this._time;
  }

  isPlaying() {
    return this._playing;
  }

  getFps() {
    return this._fps;
  }

  getDuration() {
    return this._duration;
  }

  setDuration(d: number) {
    this._duration = Math.max(0, d);
    this.publish();
  }

  setFps(fps: Fps) {
    this._fps = fps;
    this.publish();
  }

  setPlaybackRate(rate: number) {
    this._rate = Math.max(0.05, Math.min(8, rate));
    this.publish();
  }

  setLoop(loop: boolean) {
    this._loop = loop;
    this.publish();
  }

  /* ------------------------- transport ---------------------------- */

  play() {
    if (this._playing) return;
    if (this._duration > 0 && this._time >= this._duration) this._time = 0;
    this._playing = true;
    this.lastNow = 0;
    this.startLoop();
    this.publish();
  }

  pause() {
    if (!this._playing) return;
    this._playing = false;
    this.stopLoop();
    this.publish();
    this.emitTick(0);
  }

  toggle() {
    this._playing ? this.pause() : this.play();
  }

  /** Hard seek to absolute time (seconds). */
  seek(time: number) {
    const clamped = this.clampTime(time);
    if (clamped === this._time) return;
    this._time = clamped;
    this.publish();
    this.emitTick(0);
  }

  /** Scrub — same as seek but explicitly transient (no auto-pause logic). */
  scrub(time: number) {
    this._time = this.clampTime(time);
    this.publish();
    this.emitTick(0);
  }

  stepFrame(delta = 1) {
    const f = 1 / this._fps;
    this.seek(this._time + delta * f);
  }

  /* ------------------------- subscribe ---------------------------- */

  /** useSyncExternalStore-compatible: listener fires on snapshot changes. */
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Fires every RAF tick AND on seeks. Use for canvas/media sync. */
  onTick(listener: TickListener) {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  /* ------------------------- internals ---------------------------- */

  private clampTime(t: number) {
    const max = this._duration > 0 ? this._duration : Number.POSITIVE_INFINITY;
    return Math.min(Math.max(0, t), max);
  }

  private startLoop() {
    if (typeof window === "undefined") return;
    if (this.raf) return;
    const tick = (now: number) => {
      if (!this._playing) {
        this.raf = 0;
        return;
      }
      const dt = this.lastNow ? (now - this.lastNow) / 1000 : 0;
      this.lastNow = now;
      const scaled = dt * this._rate;
      let next = this._time + scaled;
      if (this._duration > 0 && next >= this._duration) {
        if (this._loop) {
          next = next % this._duration;
        } else {
          next = this._duration;
          this._time = next;
          this.emitTick(scaled);
          this.pause();
          return;
        }
      }
      this._time = next;
      this.publish();
      this.emitTick(scaled);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.lastNow = 0;
  }

  private computeSnapshot(): PlaybackSnapshot {
    return {
      time: this._time,
      playing: this._playing,
      rate: this._rate,
      loop: this._loop,
      fps: this._fps,
      duration: this._duration,
    };
  }

  private publish() {
    this.snapshot = this.computeSnapshot();
    for (const l of this.listeners) {
      try {
        l();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[playback] listener error", e);
      }
    }
  }

  private emitTick(dt: number) {
    for (const l of this.tickListeners) {
      try {
        l(this._time, dt);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[playback] tick error", e);
      }
    }
  }

  /** Diagnostics. */
  stats() {
    return {
      listeners: this.listeners.size,
      tickListeners: this.tickListeners.size,
      rafActive: this.raf !== 0,
    };
  }

  /** Test-only: hard reset. */
  __reset() {
    this.stopLoop();
    this._time = 0;
    this._playing = false;
    this._rate = 1;
    this._loop = false;
    this._duration = 0;
    this.listeners.clear();
    this.tickListeners.clear();
    this.publish();
  }
}

/** Singleton — only one clock exists. */
export const playback = new PlaybackEngine();
