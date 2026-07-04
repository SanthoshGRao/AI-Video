/**
 * Phase 3 — Project Serializer / Deserializer.
 *
 * Stable wire format:
 *
 *   {
 *     version: number,           // schema version (bump on breaking change)
 *     savedAt: number,           // ms epoch
 *     project: ProjectSec,       // full time-based project
 *     assets?: AssetRecord[],    // optional asset registry snapshot
 *   }
 *
 * Future migrations live in `MIGRATIONS`. Deserialization is defensive:
 * never throws on missing/corrupt fields — it returns a recovery report
 * alongside the best-effort project.
 */

import { assetManager, type AssetRecord } from "./asset-manager";
import type { ClipSec, ProjectSec, Scene, Track } from "./types";
import { makeDefaultProject } from "./types";

export const PROJECT_SCHEMA_VERSION = 1;

export interface SerializedProject {
  version: number;
  savedAt: number;
  project: ProjectSec;
  assets?: AssetRecord[];
}

export interface DeserializeReport {
  ok: boolean;
  recovered: boolean;
  version: number;
  warnings: string[];
  errors: string[];
  missingAssets: string[];
  droppedClips: number;
}

export interface DeserializeResult {
  project: ProjectSec;
  assets: AssetRecord[];
  report: DeserializeReport;
}

export function serializeProject(
  project: ProjectSec,
  opts: { includeAssets?: boolean } = {},
): string {
  const payload: SerializedProject = {
    version: PROJECT_SCHEMA_VERSION,
    savedAt: Date.now(),
    project,
    assets: opts.includeAssets ? assetManager.all() : undefined,
  };
  return JSON.stringify(payload);
}

type Migration = (input: SerializedProject) => SerializedProject;
const MIGRATIONS: Record<number, Migration> = {
  // 0 -> 1 placeholder for the future. Identity today.
};

function runMigrations(input: SerializedProject): SerializedProject {
  let cur = input;
  while (cur.version < PROJECT_SCHEMA_VERSION) {
    const fn = MIGRATIONS[cur.version];
    if (!fn) break;
    cur = fn(cur);
    cur.version = (cur.version ?? 0) + 1;
  }
  return cur;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function repairClip(c: Partial<ClipSec>, knownTracks: Set<number>): ClipSec | null {
  if (!c || typeof c.id !== "string" || typeof c.sceneId !== "string") return null;
  if (!c.kind) return null;
  if (!isFiniteNumber(c.startTime) || !isFiniteNumber(c.endTime)) return null;
  if (c.endTime <= c.startTime) return null;
  const trackId = isFiniteNumber(c.trackId) && knownTracks.has(c.trackId) ? c.trackId : 1;
  return {
    id: c.id,
    sceneId: c.sceneId,
    trackId,
    kind: c.kind,
    name: c.name ?? "Clip",
    startTime: Math.max(0, c.startTime),
    endTime: c.endTime,
    mediaIn: isFiniteNumber(c.mediaIn) ? c.mediaIn : undefined,
    mediaOut: isFiniteNumber(c.mediaOut) ? c.mediaOut : undefined,
    src: c.src,
    mediaKind: c.mediaKind,
    thumb: c.thumb,
    color: c.color,
    elementId: c.elementId,
    transform: c.transform,
  };
}

export function deserializeProject(
  source: string | SerializedProject,
  opts: { availableAssetUrls?: Set<string> } = {},
): DeserializeResult {
  const report: DeserializeReport = {
    ok: true,
    recovered: false,
    version: 0,
    warnings: [],
    errors: [],
    missingAssets: [],
    droppedClips: 0,
  };

  let raw: SerializedProject | null = null;
  try {
    raw = typeof source === "string" ? (JSON.parse(source) as SerializedProject) : source;
  } catch (e) {
    report.ok = false;
    report.errors.push(`parse: ${(e as Error).message}`);
    return { project: makeDefaultProject("Recovered"), assets: [], report };
  }

  if (!raw || typeof raw !== "object") {
    report.ok = false;
    report.errors.push("payload not an object");
    return { project: makeDefaultProject("Recovered"), assets: [], report };
  }

  // Tolerate missing version (treat as 0 + migrate).
  raw.version = typeof raw.version === "number" ? raw.version : 0;
  report.version = raw.version;
  if (raw.version > PROJECT_SCHEMA_VERSION) {
    report.warnings.push(`forward version ${raw.version} > ${PROJECT_SCHEMA_VERSION}, attempting`);
  }
  const migrated = runMigrations(raw);

  const p = migrated.project as Partial<ProjectSec> | undefined;
  if (!p) {
    report.ok = false;
    report.errors.push("missing project");
    return { project: makeDefaultProject("Recovered"), assets: migrated.assets ?? [], report };
  }

  // Scenes
  const scenes: Scene[] = Array.isArray(p.scenes) && p.scenes.length > 0
    ? p.scenes.filter((s): s is Scene => !!s && typeof s.id === "string")
    : makeDefaultProject().scenes;

  // Tracks
  const tracks: Track[] = Array.isArray(p.tracks) && p.tracks.length > 0
    ? p.tracks.filter((t): t is Track => !!t && typeof t.id === "number")
    : makeDefaultProject().tracks;

  const trackIds = new Set(tracks.map((t) => t.id));

  // Clips — drop unrepairable ones, keep rest
  const clips: ClipSec[] = [];
  const inputClips = Array.isArray(p.clips) ? p.clips : [];
  for (const c of inputClips) {
    const r = repairClip(c as Partial<ClipSec>, trackIds);
    if (r) clips.push(r);
    else report.droppedClips++;
  }
  if (report.droppedClips > 0) {
    report.recovered = true;
    report.warnings.push(`dropped ${report.droppedClips} corrupt clips`);
  }

  // Missing assets
  if (opts.availableAssetUrls) {
    for (const c of clips) {
      if (c.src && !opts.availableAssetUrls.has(c.src)) {
        report.missingAssets.push(c.src);
      }
    }
    if (report.missingAssets.length) {
      report.recovered = true;
      report.warnings.push(`${report.missingAssets.length} missing assets`);
    }
  }

  const project: ProjectSec = {
    id: typeof p.id === "string" ? p.id : "project_recovered",
    name: typeof p.name === "string" ? p.name : "Recovered Project",
    scenes,
    tracks,
    clips,
  };

  const assets = Array.isArray(migrated.assets) ? migrated.assets : [];

  return { project, assets, report };
}
