/**
 * Per-user daily request cap for the AI relay, keyed by Google `sub`.
 *
 * In-memory only — resets whenever the serverless function cold-starts.
 * That's a deliberate simplification for a handful of trusted desktop
 * users, not a hard billing guardrail. If this ever needs to hold across
 * cold starts (more users, real abuse risk), swap the Map below for a
 * small persistent store (e.g. Upstash Redis) without changing callers.
 */

const DEFAULT_DAILY_LIMIT = 300;

function dailyLimit(): number {
  const raw = Number(process.env.RELAY_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_LIMIT;
}

interface Bucket {
  count: number;
  resetAt: number; // epoch ms
}

const buckets = new Map<string, Bucket>();

function dayBoundaryMs(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.getTime();
}

/** Returns true and consumes one unit if the caller is still under quota. */
export function tryConsume(sub: string): { ok: boolean; remaining: number; limit: number } {
  const limit = dailyLimit();
  const now = Date.now();
  let bucket = buckets.get(sub);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: dayBoundaryMs() };
    buckets.set(sub, bucket);
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, limit };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, limit };
}
