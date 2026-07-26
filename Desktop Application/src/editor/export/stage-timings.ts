/**
 * stage-timings.ts — per-stage wall-clock accounting for one export run.
 *
 * The export pipeline is a chain of five very different subsystems (timeline
 * evaluation, ffmpeg decode, IPC + GPU composite, GPU readback, ffmpeg
 * encode) and "the export is slow" is unanswerable without knowing which of
 * them the time went to. This keeps a running total per stage plus a call
 * count, and renders the table into the JSONL export log at the end of every
 * run — so a slow export in the field is diagnosable from the log alone,
 * with no reproduction needed.
 *
 * Cost is one Date.now() pair per stage per frame; negligible next to the
 * milliseconds each stage actually takes.
 */

export type Stage = "timeline" | "decode" | "transfer+render" | "encode" | "audio" | "burnIn";

export class StageTimings {
  private totalMs = new Map<Stage, number>();
  private counts = new Map<Stage, number>();
  private startedAt = Date.now();

  /** Times an async stage and returns its result unchanged. */
  async measure<T>(stage: Stage, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      this.add(stage, Date.now() - t0);
    }
  }

  /** Times a synchronous stage and returns its result unchanged. */
  measureSync<T>(stage: Stage, fn: () => T): T {
    const t0 = Date.now();
    try {
      return fn();
    } finally {
      this.add(stage, Date.now() - t0);
    }
  }

  add(stage: Stage, ms: number): void {
    this.totalMs.set(stage, (this.totalMs.get(stage) ?? 0) + ms);
    this.counts.set(stage, (this.counts.get(stage) ?? 0) + 1);
  }

  /** Flat, log-friendly summary: total ms and per-frame average per stage. */
  summary(frameCount: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [stage, ms] of this.totalMs) {
      out[`${stage}_ms`] = Math.round(ms);
      out[`${stage}_perFrameMs`] = frameCount > 0 ? Number((ms / frameCount).toFixed(2)) : 0;
      out[`${stage}_calls`] = this.counts.get(stage) ?? 0;
    }
    out.wallClock_ms = Date.now() - this.startedAt;
    out.frames = frameCount;
    return out;
  }

  /** Human-readable table for the console, e.g. when running an export from
   * a dev harness rather than reading the JSONL log. */
  table(frameCount: number): string {
    const rows = [...this.totalMs.entries()].sort((a, b) => b[1] - a[1]);
    const width = Math.max(...rows.map(([s]) => s.length), 8);
    const lines = rows.map(([stage, ms]) => {
      const per = frameCount > 0 ? (ms / frameCount).toFixed(1) : "-";
      return `  ${stage.padEnd(width, " ")} ${String(Math.round(ms)).padStart(8)} ms   ${per.padStart(7)} ms/frame`;
    });
    const wall = Date.now() - this.startedAt;
    lines.push(`  ${"TOTAL".padEnd(width, " ")} ${String(wall).padStart(8)} ms   ${(wall / Math.max(1, frameCount)).toFixed(1).padStart(7)} ms/frame`);
    return `Export stage timings (${frameCount} frames):\n${lines.join("\n")}`;
  }
}
