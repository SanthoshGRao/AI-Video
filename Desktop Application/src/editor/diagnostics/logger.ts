/**
 * logger.ts — structured JSON-lines logging for the native editor/export
 * pipeline (main process side). Every log line is one JSON object, so a
 * future profiling view (or just `grep`/`jq` over the log file) can pull
 * out timing fields without parsing free-form text — see the original
 * ask's "Logging" and "Profiling" goals (decode/effect/GPU/encode time,
 * cache hits/misses, memory, FPS).
 *
 * Writes to <userData>/logs/editor-YYYY-MM-DD.jsonl, rotated by day, in
 * addition to the existing console.log/warn/error calls scattered through
 * this module (kept as-is for interactive `npm run dev` visibility).
 */

import fs from "fs";
import path from "path";
import { app } from "electron";

export type LogChannel = "export" | "ipc" | "data" | "media" | "boot";
export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogFields {
  [key: string]: string | number | boolean | null | undefined;
}

function logDir(): string {
  const dir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(logDir(), `editor-${date}.jsonl`);
}

function write(level: LogLevel, channel: LogChannel, message: string, fields?: LogFields): void {
  const record = {
    ts: new Date().toISOString(),
    level,
    channel,
    message,
    ...fields,
  };
  try {
    // Synchronous append rather than a buffered WriteStream: this log exists
    // to explain crashes and hard exits, and a buffered stream drops exactly
    // the lines written just before one (process.exit / app.exit / a renderer
    // taking the process down never flush it). Volume is a few dozen lines
    // per export, so the syscall cost is irrelevant.
    fs.appendFileSync(logFilePath(), JSON.stringify(record) + "\n");
  } catch {
    // Best-effort — never let logging itself crash the app.
  }
}

export const logger = {
  debug: (channel: LogChannel, message: string, fields?: LogFields) => write("debug", channel, message, fields),
  info: (channel: LogChannel, message: string, fields?: LogFields) => write("info", channel, message, fields),
  warn: (channel: LogChannel, message: string, fields?: LogFields) => write("warn", channel, message, fields),
  error: (channel: LogChannel, message: string, fields?: LogFields) => write("error", channel, message, fields),
};

/** Simple stopwatch for stage timing — `const t = timer(); ...; t.elapsedMs()`. */
export function timer() {
  const start = process.hrtime.bigint();
  return {
    elapsedMs(): number {
      return Number(process.hrtime.bigint() - start) / 1_000_000;
    },
  };
}
