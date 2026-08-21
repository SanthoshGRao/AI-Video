/**
 * Stress test: random mutate / undo / redo cycles to verify the new core
 * stays consistent after 1000+ operations.
 *
 * Pure functions — runnable from a route, a unit test, or the console.
 */

import {
  AddClipCmd,
  MoveClipCmd,
  RemoveClipCmd,
  SplitClipCmd,
  TrimClipCmd,
  UpdateClipCmd,
  type Command,
} from "./commands";
import { HistoryEngine } from "./history";
import { makeDefaultProject, type ClipSec, type ProjectSec, DEFAULT_SCENE_ID } from "./types";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function uid(p: string) {
  return `${p}_${Math.random().toString(36).slice(2, 9)}`;
}

function pickClip(p: ProjectSec, rand: () => number): ClipSec | null {
  if (!p.clips.length) return null;
  return p.clips[Math.floor(rand() * p.clips.length)];
}

function checkInvariants(p: ProjectSec, op: string) {
  for (const c of p.clips) {
    if (!(c.endTime >= c.startTime)) {
      throw new Error(`[invariant] negative-duration clip after ${op}: ${c.id} ${c.startTime}..${c.endTime}`);
    }
    if (!Number.isFinite(c.startTime) || !Number.isFinite(c.endTime)) {
      throw new Error(`[invariant] non-finite time after ${op}: ${c.id}`);
    }
    if (!p.tracks.some((t) => t.id === c.trackId)) {
      throw new Error(`[invariant] orphan trackId after ${op}: ${c.id} -> ${c.trackId}`);
    }
  }
  const ids = new Set(p.clips.map((c) => c.id));
  if (ids.size !== p.clips.length) throw new Error(`[invariant] duplicate clip ids after ${op}`);
}

export interface StressResult {
  ops: number;
  finalClipCount: number;
  undos: number;
  redos: number;
  durationMs: number;
  ok: true;
}

export function runStressTest(cycles = 1000, seed = 42): StressResult {
  const rand = rng(seed);
  const history = new HistoryEngine();
  let project: ProjectSec = makeDefaultProject("stress");

  const start = performance.now();
  let undos = 0;
  let redos = 0;

  for (let i = 0; i < cycles; i++) {
    const roll = rand();
    let cmd: Command | null = null;

    if (project.clips.length < 5 || roll < 0.35) {
      const trackId = project.tracks[Math.floor(rand() * project.tracks.length)].id;
      const startTime = rand() * 60;
      const duration = 0.5 + rand() * 5;
      const newClip: ClipSec = {
        id: uid("c"),
        sceneId: DEFAULT_SCENE_ID,
        trackId,
        kind: "video",
        name: "synthetic",
        startTime,
        endTime: startTime + duration,
      };
      cmd = new AddClipCmd(newClip);
    } else if (roll < 0.55) {
      const c = pickClip(project, rand);
      if (c) {
        const newStart = Math.max(0, c.startTime + (rand() - 0.5) * 4);
        cmd = new MoveClipCmd(c.id, newStart, c.trackId);
      }
    } else if (roll < 0.7) {
      const c = pickClip(project, rand);
      if (c) {
        const newEnd = Math.max(c.startTime + 0.1, c.endTime + (rand() - 0.5) * 2);
        cmd = new TrimClipCmd(c.id, c.startTime, newEnd, c.mediaIn);
      }
    } else if (roll < 0.8) {
      const c = pickClip(project, rand);
      if (c && c.endTime - c.startTime > 0.5) {
        const at = c.startTime + (c.endTime - c.startTime) * 0.5;
        cmd = new SplitClipCmd(c.id, at, uid("c"));
      }
    } else if (roll < 0.88) {
      const c = pickClip(project, rand);
      if (c) cmd = new UpdateClipCmd(c.id, { name: `n${i}` });
    } else if (roll < 0.95) {
      const c = pickClip(project, rand);
      if (c) cmd = new RemoveClipCmd(c.id);
    }

    if (cmd) {
      project = history.execute(project, cmd);
      checkInvariants(project, `exec ${cmd.type}`);
    }

    // Occasionally undo / redo
    const meta = rand();
    if (meta < 0.15 && history.canUndo()) {
      project = history.undo(project);
      undos++;
      checkInvariants(project, "undo");
    } else if (meta < 0.22 && history.canRedo()) {
      project = history.redo(project);
      redos++;
      checkInvariants(project, "redo");
    }
  }

  return {
    ops: cycles,
    finalClipCount: project.clips.length,
    undos,
    redos,
    durationMs: Math.round(performance.now() - start),
    ok: true,
  };
}

/* =============================================================
 * Phase 1 — playback / resolver / canvas-command tests
 * ============================================================= */

import { playback } from "./playback";
import { resolveScene, ActiveClipWindowCache } from "./selectors";
import { DEFAULT_SCENE_ID as DSID } from "./types";

export interface PhaseOneResult {
  ok: true;
  seekTest: { seeks: number; durationMs: number; maxActiveClips: number };
  playPauseTest: { cycles: number; rafLeak: boolean; durationMs: number };
  resolverTest: { clips: number; ticks: number; avgResolveUs: number };
  canvasCommandTest: { undoMatches: boolean; redoMatches: boolean };
}

function buildProject(clipCount: number): ProjectSec {
  const p = makeDefaultProject("phase1");
  const tracks = p.tracks;
  for (let i = 0; i < clipCount; i++) {
    const t = tracks[i % tracks.length];
    const startTime = (i % 200) * 0.5;
    p.clips.push({
      id: uid("c"),
      sceneId: DSID,
      trackId: t.id,
      kind: "video",
      name: `c${i}`,
      startTime,
      endTime: startTime + 2,
    });
  }
  return p;
}

export function runPhaseOneTests(): PhaseOneResult {
  // 1) 1000 random seeks against a 200-clip project
  const project = buildProject(200);
  // Note: do NOT call playback.__reset() here — it would drop the Integration
  // Layer's tick listener and break the live UI. The seek/play-pause tests
  // simply use the live engine; pre/post listener counts must match exactly.
  playback.pause();
  playback.setLoop(false);
  playback.setPlaybackRate(1);
  playback.setDuration(120);
  const seekCache = new ActiveClipWindowCache();
  let maxActive = 0;
  const seekRand = rng(7);
  const tSeekStart = performance.now();
  const SEEKS = 1000;
  for (let i = 0; i < SEEKS; i++) {
    const t = seekRand() * 120;
    playback.seek(t);
    const w = seekCache.get(project, DSID, t);
    for (const a of w.clips) {
      if (!(t >= a.clip.startTime && t <= a.clip.endTime)) {
        throw new Error(`[seek] invalid active clip ${a.clip.id} at t=${t}`);
      }
    }
    maxActive = Math.max(maxActive, w.clips.length);
  }
  const seekTest = {
    seeks: SEEKS,
    durationMs: Math.round(performance.now() - tSeekStart),
    maxActiveClips: maxActive,
  };

  // 2) 100 play/pause cycles — no duplicate RAF / no leaked listeners
  const baselineSubs = playback.stats().listeners;
  const tPP = performance.now();
  for (let i = 0; i < 100; i++) {
    playback.play();
    playback.pause();
  }
  const after = playback.stats();
  const rafLeak = after.rafActive || after.listeners !== baselineSubs;
  const playPauseTest = {
    cycles: 100,
    rafLeak,
    durationMs: Math.round(performance.now() - tPP),
  };
  if (rafLeak) throw new Error("[playPause] RAF or listener leak detected");

  // 3) Resolver correctness — 200 clip simulation, walk timeline
  const resolveRand = rng(11);
  const TICKS = 600;
  const t0 = performance.now();
  for (let i = 0; i < TICKS; i++) {
    const t = (i / TICKS) * 120;
    const active = resolveScene(project, DSID, t);
    if (i % 60 === 0) {
      for (const a of active) {
        if (!(t >= a.clip.startTime && t <= a.clip.endTime)) {
          throw new Error(`[resolver] inactive clip in result ${a.clip.id}`);
        }
      }
    }
    void resolveRand();
  }
  const elapsedUs = ((performance.now() - t0) * 1000) / TICKS;
  const resolverTest = {
    clips: project.clips.length,
    ticks: TICKS,
    avgResolveUs: Math.round(elapsedUs),
  };

  // 4) Canvas command test: transform → undo → redo
  const h = new HistoryEngine();
  let canvasProj: ProjectSec = makeDefaultProject("canvas");
  canvasProj.clips.push({
    id: "clip_x",
    sceneId: DSID,
    trackId: canvasProj.tracks[0].id,
    kind: "image",
    name: "img",
    startTime: 0,
    endTime: 2,
    transform: { x: 10, y: 10, w: 20, h: 20, rotation: 0 },
  });
  const before = { ...canvasProj.clips[0].transform! };
  canvasProj = h.execute(canvasProj, new UpdateClipCmd("clip_x", { transform: { x: 50, y: 60, w: 40, h: 30, rotation: 15 } }));
  const moved = canvasProj.clips[0].transform!;
  if (moved.x !== 50 || moved.y !== 60) throw new Error("[canvas-cmd] move did not apply");
  canvasProj = h.undo(canvasProj);
  const undone = canvasProj.clips[0].transform!;
  const undoMatches = undone.x === before.x && undone.y === before.y;
  canvasProj = h.redo(canvasProj);
  const redone = canvasProj.clips[0].transform!;
  const redoMatches = redone.x === 50 && redone.y === 60;
  if (!undoMatches || !redoMatches) throw new Error("[canvas-cmd] undo/redo mismatch");

  return {
    ok: true,
    seekTest,
    playPauseTest,
    resolverTest,
    canvasCommandTest: { undoMatches, redoMatches },
  };
}

/* =============================================================
 * Phase 1.5 — integrity / occupancy / transaction / memory tests
 * ============================================================= */

import { runTransaction } from "./transaction";
import { checkIntegrity } from "./timeline-integrity";
import {
  isOccupied,
  findGap,
  findAvailablePosition,
  resolveCollision,
} from "./occupancy-engine";


export interface PhaseOnePointFiveResult {
  ok: true;
  stress: {
    ops: number;
    committed: number;
    rejected: number;
    undos: number;
    redos: number;
    finalClipCount: number;
    durationMs: number;
  };
  occupancy: {
    isOccupied: boolean;
    foundGap: boolean;
    resolvedShifted: boolean;
  };
  rollback: {
    aborted: boolean;
    historyUnchanged: boolean;
    projectUnchanged: boolean;
  };
  memory: {
    samples: number;
    historyGrowth: number;
    listenerGrowth: number;
    stable: boolean;
  };
}

function corrupt(p: ProjectSec, op: string) {
  const r = checkIntegrity(p);
  if (!r.valid) {
    throw new Error(`[integrity ${op}] ${r.errors.map((e) => e.code).join(",")}`);
  }
}

export function runPhaseOnePointFiveTests(cycles = 10_000, seed = 1337): PhaseOnePointFiveResult {
  /* ---------------- 1. 10k random command stress ---------------- */
  const rand = rng(seed);
  const history = new HistoryEngine();
  let project: ProjectSec = makeDefaultProject("phase1.5");

  let committed = 0;
  let rejected = 0;
  let undos = 0;
  let redos = 0;

  const t0 = performance.now();
  for (let i = 0; i < cycles; i++) {
    const roll = rand();
    let cmd: Command | null = null;

    if (project.clips.length < 5 || roll < 0.4) {
      const trackId = project.tracks[Math.floor(rand() * project.tracks.length)].id;
      const startTime = rand() * 60;
      const duration = 0.5 + rand() * 4;
      cmd = new AddClipCmd({
        id: uid("c"),
        sceneId: DEFAULT_SCENE_ID,
        trackId,
        kind: "video",
        name: "s",
        startTime,
        endTime: startTime + duration,
      });
    } else if (roll < 0.58) {
      const c = pickClip(project, rand);
      if (c) cmd = new MoveClipCmd(c.id, Math.max(0, c.startTime + (rand() - 0.5) * 4), c.trackId);
    } else if (roll < 0.72) {
      const c = pickClip(project, rand);
      if (c) {
        const newEnd = Math.max(c.startTime + 0.1, c.endTime + (rand() - 0.5) * 2);
        cmd = new TrimClipCmd(c.id, c.startTime, newEnd, c.mediaIn);
      }
    } else if (roll < 0.82) {
      const c = pickClip(project, rand);
      if (c && c.endTime - c.startTime > 0.5) {
        cmd = new SplitClipCmd(c.id, c.startTime + (c.endTime - c.startTime) * 0.5, uid("c"));
      }
    } else if (roll < 0.9) {
      const c = pickClip(project, rand);
      if (c) cmd = new UpdateClipCmd(c.id, { name: `n${i}` });
    } else if (roll < 0.96) {
      const c = pickClip(project, rand);
      if (c) cmd = new RemoveClipCmd(c.id);
    }

    if (cmd) {
      const tx = runTransaction(history, project, cmd);
      if (tx.ok) {
        project = tx.project;
        committed++;
        corrupt(project, cmd.type);
      } else {
        rejected++;
        // post-state must be untouched
        if (tx.project !== project) throw new Error("[tx] rollback returned new project ref");
      }
    }

    const meta = rand();
    if (meta < 0.15 && history.canUndo()) {
      project = history.undo(project);
      undos++;
      corrupt(project, "undo");
    } else if (meta < 0.22 && history.canRedo()) {
      project = history.redo(project);
      redos++;
      corrupt(project, "redo");
    }
  }
  const stressMs = Math.round(performance.now() - t0);

  /* ---------------- 2. occupancy spot-checks ---------------- */
  const occProj = makeDefaultProject("occ");
  const trackId = occProj.tracks[0].id;
  occProj.clips.push({
    id: "a",
    sceneId: DEFAULT_SCENE_ID,
    trackId,
    kind: "video",
    name: "a",
    startTime: 0,
    endTime: 5,
  });
  occProj.clips.push({
    id: "b",
    sceneId: DEFAULT_SCENE_ID,
    trackId,
    kind: "video",
    name: "b",
    startTime: 10,
    endTime: 15,
  });
  const occ = isOccupied(occProj, DEFAULT_SCENE_ID, trackId, 2, 4);
  const gap = findGap(occProj, DEFAULT_SCENE_ID, trackId, 3, 0);
  if (!gap || Math.abs(gap.start - 5) > 1e-6) {
    throw new Error("[occupancy] expected gap at 5..8");
  }
  const pos = findAvailablePosition(occProj, DEFAULT_SCENE_ID, trackId, 3, 1);
  if (Math.abs(pos - 5) > 1e-6) throw new Error(`[occupancy] expected snap to 5, got ${pos}`);
  const res = resolveCollision(occProj, DEFAULT_SCENE_ID, trackId, 3, 6);

  /* ---------------- 3. explicit rollback verification ---------------- */
  const rbHistory = new HistoryEngine();
  let rbProject: ProjectSec = makeDefaultProject("rb");
  // Add a valid clip first
  const validRes = runTransaction(
    rbHistory,
    rbProject,
    new AddClipCmd({
      id: "rb_ok",
      sceneId: DEFAULT_SCENE_ID,
      trackId: rbProject.tracks[0].id,
      kind: "video",
      name: "ok",
      startTime: 0,
      endTime: 1,
    }),
  );
  if (!validRes.ok) throw new Error("[rollback] baseline add failed");
  rbProject = validRes.project;
  const histPastBefore = (rbHistory as unknown as { past: unknown[] }).past.length;

  // Now an INVALID add: orphan trackId
  const bad = runTransaction(
    rbHistory,
    rbProject,
    new AddClipCmd({
      id: "rb_bad",
      sceneId: DEFAULT_SCENE_ID,
      trackId: 9999,
      kind: "video",
      name: "bad",
      startTime: 2,
      endTime: 3,
    }),
  );
  const histPastAfter = (rbHistory as unknown as { past: unknown[] }).past.length;
  const rollback = {
    aborted: !bad.ok,
    historyUnchanged: histPastBefore === histPastAfter,
    projectUnchanged: bad.project === rbProject,
  };
  if (!rollback.aborted || !rollback.historyUnchanged || !rollback.projectUnchanged) {
    throw new Error("[rollback] failed integrity guarantee");
  }

  /* ---------------- 4. memory monitor ---------------- */
  const memHistory = new HistoryEngine();
  let memProj: ProjectSec = makeDefaultProject("mem");
  // Add 100 then remove 100 — history grows but listeners must not.
  const baseListeners = playback.stats().listeners;
  const SAMPLES = 5;
  let lastHistory = 0;
  let historyGrowth = 0;
  for (let s = 0; s < SAMPLES; s++) {
    for (let i = 0; i < 100; i++) {
      const r = runTransaction(
        memHistory,
        memProj,
        new AddClipCmd({
          id: `m_${s}_${i}`,
          sceneId: DEFAULT_SCENE_ID,
          trackId: memProj.tracks[0].id,
          kind: "video",
          name: "m",
          startTime: i * 2,
          endTime: i * 2 + 1,
        }),
      );
      if (r.ok) memProj = r.project;
    }
    for (let i = 0; i < 100; i++) {
      const r = runTransaction(memHistory, memProj, new RemoveClipCmd(`m_${s}_${i}`));
      if (r.ok) memProj = r.project;
    }
    const cur = (memHistory as unknown as { past: unknown[] }).past.length;
    if (s > 0) historyGrowth = cur - lastHistory;
    lastHistory = cur;
  }
  const listenerGrowth = playback.stats().listeners - baseListeners;
  const stable = listenerGrowth === 0; // history is bounded by LIMIT, growth tapers
  if (!stable) throw new Error("[memory] listener leak detected");

  // Final integrity check on the heavily mutated project
  corrupt(project, "final");

  return {
    ok: true,
    stress: {
      ops: cycles,
      committed,
      rejected,
      undos,
      redos,
      finalClipCount: project.clips.length,
      durationMs: stressMs,
    },
    occupancy: { isOccupied: occ, foundGap: !!gap, resolvedShifted: res.shifted },
    rollback,
    memory: {
      samples: SAMPLES,
      historyGrowth,
      listenerGrowth,
      stable,
    },
  };
}

/* =============================================================
 * Phase 2 — Timeline Engine V2 + snap + virtualization tests
 * ============================================================= */

import {
  buildMoveClip,
  buildTrimRight,
  buildSplitAt,
  buildRippleDelete,
  buildDuplicate,
} from "./timeline-engine";
import { snapTime } from "./snap";
import {
  visibleTimeRange,
  filterVisibleClips,
  visibleTrackIds,
  autoScroll,
} from "./virtualization";

export interface PhaseTwoResult {
  ok: true;
  timelineEngine: {
    moveResolvesCollision: boolean;
    trimRespectsMinDuration: boolean;
    splitProducesTwoClips: boolean;
    rippleDeleteClosesGap: boolean;
    duplicateAddsClip: boolean;
  };
  snap: {
    snapsToClipEdge: boolean;
    snapsToPlayhead: boolean;
    ignoresWhenOutsideThreshold: boolean;
    excludeRespected: boolean;
  };
  virtualization: {
    visibleRangeCorrect: boolean;
    filteredCount: number;
    trackWindowCount: number;
    autoScrollTriggers: boolean;
  };
}

function phase2Project(): ProjectSec {
  const p = makeDefaultProject("phase2");
  const trackId = p.tracks[0].id;
  // A: 0..4, B: 5..9, C: 12..15 on the same track.
  p.clips.push(
    {
      id: "A",
      sceneId: DEFAULT_SCENE_ID,
      trackId,
      kind: "video",
      name: "A",
      startTime: 0,
      endTime: 4,
    },
    {
      id: "B",
      sceneId: DEFAULT_SCENE_ID,
      trackId,
      kind: "video",
      name: "B",
      startTime: 5,
      endTime: 9,
    },
    {
      id: "C",
      sceneId: DEFAULT_SCENE_ID,
      trackId,
      kind: "video",
      name: "C",
      startTime: 12,
      endTime: 15,
    },
  );
  return p;
}

export function runPhaseTwoTests(): PhaseTwoResult {
  /* --- Timeline Engine V2 builders --- */
  const history = new HistoryEngine();
  let project = phase2Project();
  const trackId = project.tracks[0].id;

  // Move B onto A's slot — occupancy must push it to a free position.
  const moveCmd = buildMoveClip(project, "B", 1, trackId);
  const movedProject = history.execute(project, moveCmd);
  const movedB = movedProject.clips.find((c) => c.id === "B")!;
  // Must NOT overlap A (0..4)
  const moveResolvesCollision =
    movedB.startTime >= 4 - 1e-6 || movedB.endTime <= 0 + 1e-6;

  // Trim right below min duration -> clamped, never inverted.
  const trimCmd = buildTrimRight(project, "A", -10);
  const trimmed = history.execute(project, trimCmd).clips.find((c) => c.id === "A")!;
  const trimRespectsMinDuration = trimmed.endTime > trimmed.startTime;

  // Split A at t=2 -> two clips covering 0..2 and 2..4
  const splitCmd = buildSplitAt(project, "A", 2);
  if (!splitCmd) throw new Error("[phase2] split returned null");
  const splitProject = history.execute(project, splitCmd);
  const splitHalves = splitProject.clips.filter(
    (c) => c.trackId === trackId && c.startTime < 4 + 1e-6 && c.endTime > -1e-6 && c.startTime < 4,
  );
  const splitProducesTwoClips =
    splitProject.clips.length === project.clips.length + 1 &&
    splitHalves.some((c) => Math.abs(c.endTime - 2) < 1e-3) &&
    splitHalves.some((c) => Math.abs(c.startTime - 2) < 1e-3);

  // Ripple delete B -> C should shift left by B's duration (4s).
  const rippleCmd = buildRippleDelete(project, ["B"]);
  if (!rippleCmd) throw new Error("[phase2] ripple delete null");
  const rippled = history.execute(project, rippleCmd);
  const cAfter = rippled.clips.find((c) => c.id === "C")!;
  const rippleDeleteClosesGap = Math.abs(cAfter.startTime - 8) < 1e-3;

  // Duplicate A -> +1 clip.
  const dupCmd = buildDuplicate(project, ["A"]);
  if (!dupCmd) throw new Error("[phase2] duplicate null");
  const dupProject = history.execute(project, dupCmd);
  const duplicateAddsClip = dupProject.clips.length === project.clips.length + 1;

  /* --- Snap --- */
  const snapInput = {
    project,
    sceneId: DEFAULT_SCENE_ID,
    playhead: 10,
    markers: [],
    thresholdPx: 8,
    pxPerSecond: 100, // 0.08s threshold
  };
  // desired = 4.05 -> within 0.08s of clip A endTime (4) and B startTime (5) - 0.95 away.
  const s1 = snapTime(4.05, snapInput);
  const snapsToClipEdge = s1.snapped && Math.abs(s1.time - 4) < 1e-6;

  // desired = 9.99 -> nearest is playhead at 10 (0.01s).
  const s2 = snapTime(9.99, snapInput);
  const snapsToPlayhead = s2.snapped && Math.abs(s2.time - 10) < 1e-6;

  // desired = 7 -> nothing within 0.08s.
  const s3 = snapTime(7, snapInput);
  const ignoresWhenOutsideThreshold = !s3.snapped && Math.abs(s3.time - 7) < 1e-9;

  // Excluding B should prevent snapping to its edges. desired = 5.01, pxPerSec=100, threshold 8 -> 0.08s
  const s4 = snapTime(5.01, { ...snapInput, exclude: new Set(["B"]) });
  const excludeRespected = !(s4.snapped && Math.abs(s4.time - 5) < 1e-6);

  /* --- Virtualization --- */
  const viewport = {
    scrollX: 500, // = 5s @ 100 px/s
    width: 600, // = 6s
    pxPerSecond: 100,
    overscanSec: 0,
  };
  const range = visibleTimeRange(viewport);
  const visibleRangeCorrect =
    Math.abs(range.start - 5) < 1e-6 && Math.abs(range.end - 11) < 1e-6;

  const trackSet = new Set([trackId]);
  const visClips = filterVisibleClips(project, viewport, trackSet, DEFAULT_SCENE_ID);
  // Range 5..11 intersects B(5..9). A(0..4) excluded, C(12..15) excluded.
  const filteredCount = visClips.length;

  const tracksWindow = visibleTrackIds(
    project.tracks.map((t) => t.id),
    0,
    100,
    32,
    0,
  );
  const trackWindowCount = tracksWindow.size;

  const scroll = autoScroll({
    scrollX: 0,
    width: 600,
    pxPerSecond: 100,
    playheadTime: 5.5, // 550px, threshold = 0 + 600*0.8 = 480 -> triggers
  });
  const autoScrollTriggers = scroll !== null && scroll > 0;

  if (filteredCount !== 1) throw new Error(`[phase2] expected 1 visible clip, got ${filteredCount}`);
  if (trackWindowCount !== project.tracks.length && trackWindowCount === 0) {
    throw new Error("[phase2] track window empty");
  }
  if (
    !moveResolvesCollision ||
    !trimRespectsMinDuration ||
    !splitProducesTwoClips ||
    !rippleDeleteClosesGap ||
    !duplicateAddsClip
  ) {
    throw new Error("[phase2] timeline-engine assertion failed");
  }
  if (!snapsToClipEdge || !snapsToPlayhead || !ignoresWhenOutsideThreshold || !excludeRespected) {
    throw new Error("[phase2] snap assertion failed");
  }
  if (!visibleRangeCorrect || !autoScrollTriggers) {
    throw new Error("[phase2] virtualization assertion failed");
  }

  return {
    ok: true,
    timelineEngine: {
      moveResolvesCollision,
      trimRespectsMinDuration,
      splitProducesTwoClips,
      rippleDeleteClosesGap,
      duplicateAddsClip,
    },
    snap: { snapsToClipEdge, snapsToPlayhead, ignoresWhenOutsideThreshold, excludeRespected },
    virtualization: {
      visibleRangeCorrect,
      filteredCount,
      trackWindowCount,
      autoScrollTriggers,
    },
  };
}


/* =============================================================
 * Phase 4 — Same-Track Single-Active-Clip invariant
 * ============================================================= */

import { rawActiveClips } from "./selectors";
import { buildCanvasRenderPlan } from "./render-pipeline-debug";

export interface PhaseFourResult {
  ok: true;
  consecutiveSameTrack: { samples: number; maxActivePerTrack: number };
  crossTrackOverlap: { bothRender: boolean };
  hundredClipScrub: {
    clips: number;
    frames: number;
    maxActivePerTrack: number;
    rawViolations: number;
  };
  visualMapping: { clipAElement: string; clipBElement: string; clipAAsset: string; clipBAsset: string };
}

/** Build a single-track, N-clip back-to-back project (each clip duration 1s). */
function buildSameTrackProject(n: number, trackId = 1): ProjectSec {
  const p = makeDefaultProject("phase4-same-track");
  for (let i = 0; i < n; i++) {
    p.clips.push({
      id: `c_${i}`,
      sceneId: DSID,
      trackId,
      kind: "video",
      name: `c${i}`,
      startTime: i,
      endTime: i + 1,
    });
  }
  return p;
}

export function runPhaseFourTests(): PhaseFourResult {
  // Test 1 — Track 1 with [A 0-10][B 10-20]. At every sample in [0,20)
  // exactly one clip on track 1 must be active.
  const t1 = makeDefaultProject("phase4-t1");
  t1.clips.push(
    { id: "A", sceneId: DSID, trackId: 1, kind: "video", name: "A", startTime: 0, endTime: 10 },
    { id: "B", sceneId: DSID, trackId: 1, kind: "video", name: "B", startTime: 10, endTime: 20 },
  );
  let maxT1 = 0;
  const SAMPLES = 400;
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * 20;
    const active = resolveScene(t1, DSID, t);
    const perTrack = new Map<number, number>();
    for (const a of active) perTrack.set(a.clip.trackId, (perTrack.get(a.clip.trackId) ?? 0) + 1);
    for (const n of perTrack.values()) maxT1 = Math.max(maxT1, n);
    // Boundary check: at t=10, only B may be active.
    if (Math.abs(t - 10) < 1e-9) {
      const ids = active.map((a) => a.clip.id);
      if (ids.length !== 1 || ids[0] !== "B") {
        throw new Error(`[phase4/t1] boundary at t=10 returned ${JSON.stringify(ids)}`);
      }
    }
  }
  if (maxT1 > 1) throw new Error(`[phase4/t1] same-track overlap detected (max=${maxT1})`);

  // Test 2 — different tracks, same time, both must render.
  const t2 = makeDefaultProject("phase4-t2");
  t2.clips.push(
    { id: "A", sceneId: DSID, trackId: 1, kind: "video", name: "A", startTime: 0, endTime: 5 },
    { id: "B", sceneId: DSID, trackId: 2, kind: "image", name: "B", startTime: 0, endTime: 5 },
  );
  const both = resolveScene(t2, DSID, 2.5);
  const bothRender = both.length === 2 && new Set(both.map((a) => a.clip.trackId)).size === 2;
  if (!bothRender) throw new Error("[phase4/t2] cross-track overlap did not render both clips");

  // Test 3 — 100 consecutive clips on a single track, scrub every 0.01s.
  const t3 = buildSameTrackProject(100, 1);
  let maxT3 = 0;
  let rawViolations = 0;
  const FRAMES = 10_000; // 0..100s in 0.01 increments
  for (let i = 0; i < FRAMES; i++) {
    const t = (i / FRAMES) * 100;
    const active = resolveScene(t3, DSID, t);
    const perTrack = new Map<number, number>();
    for (const a of active) perTrack.set(a.clip.trackId, (perTrack.get(a.clip.trackId) ?? 0) + 1);
    for (const n of perTrack.values()) maxT3 = Math.max(maxT3, n);
    // raw view should also be 1 because consecutive clips don't overlap.
    const r = rawActiveClips(t3, DSID, t);
    if (r.length > 1) rawViolations += 1;
  }
  if (maxT3 > 1) throw new Error(`[phase4/t3] resolver returned >1 same-track clip`);
  if (rawViolations > 0) {
    throw new Error(
      `[phase4/t3] raw overlap detected — consecutive clips should be exclusive`,
    );
  }

  // Test 4 — deliberately invalid: two clips on the same track overlap.
  // Resolver must still report exactly one (latest startTime wins).
  const t4 = makeDefaultProject("phase4-t4");
  t4.clips.push(
    { id: "OLD", sceneId: DSID, trackId: 1, kind: "video", name: "OLD", startTime: 0, endTime: 10 },
    { id: "NEW", sceneId: DSID, trackId: 1, kind: "video", name: "NEW", startTime: 5, endTime: 15 },
  );
  const mid = resolveScene(t4, DSID, 7);
  if (mid.length !== 1 || mid[0].clip.id !== "NEW") {
    throw new Error(
      `[phase4/t4] overlap not resolved — got ${JSON.stringify(mid.map((a) => a.clip.id))}`,
    );
  }

  // Test 5 — actual render mapping, not active counts. Consecutive clips must
  // produce different rendered elements/assets when the playhead crosses into B.
  const legacyClips = [
    { id: "visual_A", kind: "image" as const, name: "A", start: 0, width: 200, track: 1, elementId: "el_A", src: "data:image/svg+xml,A" },
    { id: "visual_B", kind: "image" as const, name: "B", start: 200, width: 200, track: 1, elementId: "el_B", src: "data:image/svg+xml,B" },
  ];
  const legacyElements = [
    { id: "el_A", kind: "image" as const, x: 0, y: 0, w: 100, h: 100, rotation: 0, color: "#fff", src: "data:image/svg+xml,A" },
    { id: "el_B", kind: "image" as const, x: 0, y: 0, w: 100, h: 100, rotation: 0, color: "#fff", src: "data:image/svg+xml,B" },
  ];
  const renderA = buildCanvasRenderPlan(legacyClips, legacyElements, 5).renderedItems[0];
  const renderB = buildCanvasRenderPlan(legacyClips, legacyElements, 15).renderedItems[0];
  if (!renderA || !renderB) throw new Error("[phase4/t5] render plan produced no canvas element");
  if (renderA.clip.id !== "visual_A" || renderA.element.id !== "el_A") {
    throw new Error(`[phase4/t5] A rendered wrong mapping ${renderA.clip.id} -> ${renderA.element.id}`);
  }
  if (renderB.clip.id !== "visual_B" || renderB.element.id !== "el_B") {
    throw new Error(`[phase4/t5] B rendered wrong mapping ${renderB.clip.id} -> ${renderB.element.id}`);
  }
  if (renderA.assetId === renderB.assetId || String(renderA.element.id) === String(renderB.element.id)) {
    throw new Error("[phase4/t5] A and B share rendered asset/element binding");
  }

  return {
    ok: true,
    consecutiveSameTrack: { samples: SAMPLES, maxActivePerTrack: maxT1 },
    crossTrackOverlap: { bothRender },
    hundredClipScrub: {
      clips: 100,
      frames: FRAMES,
      maxActivePerTrack: maxT3,
      rawViolations,
    },
    visualMapping: {
      clipAElement: renderA.element.id,
      clipBElement: renderB.element.id,
      clipAAsset: renderA.assetId,
      clipBAsset: renderB.assetId,
    },
  };
}
