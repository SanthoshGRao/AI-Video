/**
 * Timing layout for the AI fact/title overlays that sit above the subtitles.
 *
 * Two rules, both of which the old ad-hoc logic broke:
 *
 * 1. A fact's start time is the start of the subtitle cue it was extracted
 *    from and must never move. The previous "prevent overlap" loop pushed a
 *    fact's start forward to the previous fact's end, which cascaded down the
 *    list — every title after the first drifted further away from the line
 *    that was actually being spoken.
 *
 * 2. The title track covers the whole video, not isolated islands. Each fact
 *    runs until the next fact starts, and the last one runs to the end of the
 *    video, so a title is on screen for exactly as long as the subtitles it
 *    belongs to (no dead gaps, no single short card).
 */

export type FactOverlayTiming = {
  startMs: number;
  endMs: number;
};

/** Two facts landing closer than this are indistinguishable on screen — the
 *  second would flash for a few frames — so the later one is dropped. */
export const MIN_FACT_VISIBLE_MS = 700;

export type LayoutFactTimingsOptions = {
  /** End of the video (voiceover duration, or last cue end). The final fact
   *  runs to here. */
  totalDurationMs?: number;
  /** Start of the covered range. The first fact is pulled back to this so the
   *  title track starts with the video like the subtitle track does. */
  coverFromMs?: number;
};

/**
 * Sort facts by start time, drop ones that collide, then stretch each to the
 * next one's start (last → end of video). Returns new objects; inputs are not
 * mutated.
 */
export function layoutFactTimings<T extends FactOverlayTiming>(
  facts: readonly T[],
  options: LayoutFactTimingsOptions = {},
): T[] {
  const sorted = [...facts]
    .filter((f) => Number.isFinite(f.startMs))
    .sort((a, b) => a.startMs - b.startMs);
  if (sorted.length === 0) return [];

  const kept: T[] = [];
  for (const fact of sorted) {
    const prev = kept[kept.length - 1];
    if (prev && fact.startMs - prev.startMs < MIN_FACT_VISIBLE_MS) continue;
    kept.push(fact);
  }

  const lastCueEnd = Math.max(...kept.map((f) => (Number.isFinite(f.endMs) ? f.endMs : 0)));
  const totalMs = Math.max(
    options.totalDurationMs ?? 0,
    lastCueEnd,
    kept[kept.length - 1].startMs + MIN_FACT_VISIBLE_MS,
  );
  const coverFrom = Math.max(0, options.coverFromMs ?? 0);

  return kept.map((fact, index) => {
    const startMs = index === 0 ? Math.min(fact.startMs, coverFrom) : fact.startMs;
    const nextStart = index < kept.length - 1 ? kept[index + 1].startMs : totalMs;
    return {
      ...fact,
      startMs,
      endMs: Math.max(startMs + MIN_FACT_VISIBLE_MS, nextStart),
    };
  });
}
