/**
 * Phase 1.5 — Transaction System.
 *
 * Wraps the existing command/history pipeline so every mutation becomes:
 *
 *   Command → preValidate → apply → integrityCheck → commit | rollback
 *
 * Invalid commands NEVER reach the store. Rollback is automatic — the
 * project reference returned to the caller is the original pre-state when a
 * transaction aborts.
 *
 * Pure with respect to the store: the HistoryEngine is only mutated on
 * commit, never on abort.
 */

import type { Command } from "./commands";
import { HistoryEngine } from "./history";
import { checkIntegrity, type IntegrityReport } from "./timeline-integrity";
import type { ProjectSec } from "./types";

export type TxStage = "pre-validate" | "apply" | "post-integrity";

export interface TxResult {
  ok: boolean;
  project: ProjectSec;
  /** Set when ok=false. */
  reason?: string;
  stage?: TxStage;
  report?: IntegrityReport;
}

/** Lightweight pre-flight before apply. Catches programmer errors fast. */
function preValidate(cmd: Command): string | null {
  if (!cmd || typeof cmd.apply !== "function" || typeof cmd.inverse !== "function") {
    return "command missing apply/inverse";
  }
  if (typeof cmd.type !== "string" || !cmd.type) return "command missing type";
  return null;
}

/**
 * Run a command transactionally against the given history + project.
 * On success the inverse is pushed to history and the new project is returned.
 * On failure the project is returned unchanged and history is untouched.
 */
export function runTransaction(
  history: HistoryEngine,
  project: ProjectSec,
  cmd: Command,
): TxResult {
  const preErr = preValidate(cmd);
  if (preErr) {
    return { ok: false, project, reason: preErr, stage: "pre-validate" };
  }

  let next: ProjectSec;
  let inverse: Command;
  try {
    inverse = cmd.inverse(project);
    next = cmd.apply(project);
  } catch (e) {
    return {
      ok: false,
      project,
      reason: (e as Error).message,
      stage: "apply",
    };
  }

  const report = checkIntegrity(next);
  if (!report.valid) {
    // Rollback: simply discard `next` and `inverse`. History was not mutated.
    return {
      ok: false,
      project,
      reason: report.errors[0]?.message ?? "integrity check failed",
      stage: "post-integrity",
      report,
    };
  }

  // Commit. Mirror HistoryEngine.execute semantics manually so we use the
  // inverse we already computed against the pre-state.
  // @ts-expect-error — touching internal stacks intentionally (single owner).
  history.past.push(inverse);
  // @ts-expect-error — clear redo on new commit.
  history.future = [];
  // @ts-expect-error — soft-cap to the same LIMIT as HistoryEngine.execute.
  if (history.past.length > 500) history.past.shift();

  return { ok: true, project: next, report };
}
