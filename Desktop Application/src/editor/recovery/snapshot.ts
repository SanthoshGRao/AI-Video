/**
 * snapshot.ts — local-disk crash-recovery snapshots of the in-editor
 * NativeProject state, independent of the DB save path. The renderer
 * autosaves to Postgres every 20s (see useProjectStore.ts), but that's a
 * round trip that can itself fail (network/DB hiccup) or simply not have
 * run yet if the app crashes moments after an edit. A local JSON snapshot
 * written far more cheaply/frequently is the backstop — same spirit as
 * the original ask's "never crash, return meaningful errors" plus a real
 * safety net if it does.
 */

import fs from "fs";
import path from "path";
import type { NativeProject } from "../model/types";
import { storagePath } from "../../config";

interface SnapshotEnvelope {
  savedAt: string;
  timelineVersion: number;
  project: NativeProject;
}

function recoveryDir(): string {
  const dir = path.join(storagePath(), "recovery");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function snapshotPath(projectId: string): string {
  return path.join(recoveryDir(), `${projectId}.json`);
}

export function writeSnapshot(projectId: string, project: NativeProject, timelineVersion: number): void {
  const envelope: SnapshotEnvelope = { savedAt: new Date().toISOString(), timelineVersion, project };
  try {
    fs.writeFileSync(snapshotPath(projectId), JSON.stringify(envelope), "utf-8");
  } catch (err) {
    console.warn(`[recovery] Failed to write snapshot for ${projectId}:`, err);
  }
}

export function readSnapshot(projectId: string): SnapshotEnvelope | null {
  try {
    const raw = fs.readFileSync(snapshotPath(projectId), "utf-8");
    return JSON.parse(raw) as SnapshotEnvelope;
  } catch {
    return null;
  }
}

export function clearSnapshot(projectId: string): void {
  try {
    fs.unlinkSync(snapshotPath(projectId));
  } catch {
    /* nothing to clear */
  }
}

/** A snapshot is only worth offering as a restore if it's strictly ahead
 * of the DB row the editor just loaded (later version, or same version
 * with edits made after the DB row was written). */
export function isSnapshotNewer(snapshot: SnapshotEnvelope, dbTimelineVersion: number, dbCreatedAt: string): boolean {
  if (snapshot.timelineVersion > dbTimelineVersion) return true;
  if (snapshot.timelineVersion < dbTimelineVersion) return false;
  return new Date(snapshot.savedAt).getTime() > new Date(dbCreatedAt).getTime();
}
