/**
 * Phase 3 — Media Pipeline Tests.
 *
 * Synthetic tests that exercise the full pipeline without real network or
 * decoding: register N assets, fake metadata + thumbnails through public
 * setters, push records into the IndexedDB cache, then reload and verify
 * the cache is reused. Also exercises the Scene Preloader and Serializer.
 */

import { assetManager, type AssetRecord } from "./asset-manager";
import { cache, STORES } from "./cache";
import { mediaEngine } from "./media-engine";
import { preloader } from "./preloader";
import { deserializeProject, serializeProject } from "./project-serializer";
import type { ClipSec, ProjectSec } from "./types";
import { makeDefaultProject } from "./types";

export interface MediaPipelineResult {
  ok: boolean;
  durationMs: number;
  assetsRegistered: number;
  cacheWrites: number;
  cacheHits: number;
  cacheMisses: number;
  reloadReused: number;
  preloadedScenes: number;
  serializerRoundTripOk: boolean;
  recoveryOk: boolean;
  errors: string[];
}

function syntheticProject(scenes: number, clipsPerScene: number): ProjectSec {
  const base = makeDefaultProject("Synthetic");
  const sceneList = Array.from({ length: scenes }, (_, i) => ({
    id: `scene_${i}`,
    name: `Scene ${i + 1}`,
    order: i,
  }));
  const clips: ClipSec[] = [];
  for (const s of sceneList) {
    for (let i = 0; i < clipsPerScene; i++) {
      clips.push({
        id: `${s.id}_clip_${i}`,
        sceneId: s.id,
        trackId: 1,
        kind: "video",
        name: `Clip ${i}`,
        startTime: i * 2,
        endTime: i * 2 + 2,
        src: `mem://asset_${(i + sceneList.indexOf(s)) % 50}`,
      });
    }
  }
  return { ...base, scenes: sceneList, clips };
}

function fakeBlob(): Blob {
  return new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" });
}

export async function runPhaseThreeTests(opts: {
  assetCount?: number;
  scenes?: number;
  clipsPerScene?: number;
} = {}): Promise<MediaPipelineResult> {
  const t0 = performance.now();
  const errors: string[] = [];
  const N = opts.assetCount ?? 100;
  const scenes = opts.scenes ?? 10;
  const cps = opts.clipsPerScene ?? 5;

  mediaEngine.__reset();
  await cache.clear().catch(() => {});

  // 1. Synthetic asset registry — bypass workers; write directly to manager + cache
  for (let i = 0; i < N; i++) {
    const a: AssetRecord = {
      assetId: `asset_${i}`,
      name: `Asset ${i}`,
      kind: i % 3 === 0 ? "image" : "video",
      status: "ready",
      originalUrl: `mem://asset_${i}`,
      proxyUrl: `mem://asset_${i}`,
      metadata: { duration: 5, width: 1920, height: 1080, fps: 30 },
      progress: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    assetManager.upsert(a);
    await cache.putAsset(a);
    await cache.putThumbnail({
      assetId: a.assetId,
      blob: fakeBlob(),
      width: 256,
      height: 144,
      createdAt: Date.now(),
    });
  }

  const cacheWrites = cache.stats.writes;
  if (cacheWrites < N * 2) errors.push(`cache writes too low: ${cacheWrites}`);
  if (assetManager.count() !== N) errors.push(`asset count mismatch: ${assetManager.count()}`);

  // 2. Reload — read every asset/thumbnail from cache, verify
  let reused = 0;
  for (let i = 0; i < N; i++) {
    const a = await cache.getAsset(`asset_${i}`);
    const t = await cache.getThumbnail(`asset_${i}`);
    if (a && t) reused++;
  }
  if (reused !== N) errors.push(`reload mismatch: ${reused}/${N}`);

  // 3. Preloader exercise
  const project = syntheticProject(scenes, cps);
  preloader.__reset();
  preloader.preloadForScene(project, project.scenes[0].id);
  preloader.preloadForScene(project, project.scenes[Math.min(2, scenes - 1)].id);
  const preloadedScenes = preloader.preloadedSceneIds().length;
  if (preloadedScenes < 1) errors.push("preloader did not warm any scene");

  // 4. Serializer round-trip
  const wire = serializeProject(project, { includeAssets: true });
  const { project: rt, report } = deserializeProject(wire);
  const roundTrip =
    rt.clips.length === project.clips.length &&
    rt.scenes.length === project.scenes.length &&
    report.errors.length === 0;
  if (!roundTrip) errors.push("serializer round-trip failed");

  // 5. Recovery from corrupted payload
  const corrupt = serializeProject(project);
  const broken = JSON.parse(corrupt) as { project: { clips: unknown[] } };
  broken.project.clips.push({ id: "x" } as unknown);
  broken.project.clips.push({ id: 5 } as unknown);
  const { report: recReport } = deserializeProject(JSON.stringify(broken));
  const recoveryOk = recReport.droppedClips >= 2 && recReport.ok;
  if (!recoveryOk) errors.push("recovery did not drop corrupt clips");

  // cleanup
  preloader.__reset();
  await cache.clear(STORES.assets).catch(() => {});
  await cache.clear(STORES.thumbnails).catch(() => {});

  return {
    ok: errors.length === 0,
    durationMs: Math.round(performance.now() - t0),
    assetsRegistered: N,
    cacheWrites,
    cacheHits: cache.stats.hits,
    cacheMisses: cache.stats.misses,
    reloadReused: reused,
    preloadedScenes,
    serializerRoundTripOk: roundTrip,
    recoveryOk,
    errors,
  };
}
