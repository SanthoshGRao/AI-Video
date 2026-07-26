/**
 * ids.ts — ID generation matching Prisma's client-side `@default(cuid())`.
 * Prisma 7 uses the cuid2 algorithm, generated client-side (not a Postgres
 * function) — since the native editor writes rows directly via `pg`
 * without going through Prisma, it must generate compatible IDs itself.
 */

import { createId } from "@paralleldrive/cuid2";

export function newId(): string {
  return createId();
}
