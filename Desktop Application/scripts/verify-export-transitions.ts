/**
 * Verifies the NATIVE EXPORT applies transitions, and applies them the same way
 * the editor preview does. Run: npx tsx scripts/verify-export-transitions.ts
 */
import { resolveFrameAt } from "../src/editor/export/timeline-evaluator";
import { activeTransitionsAt, transitionLayerStyles } from "../src/editor/export/transitions";
import type { NativeProject, NativeClip, TransitionType } from "../src/editor/model/types";

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
};

const DUR = 0.6;
const W = 1080, H = 1920;

function makeProject(type: TransitionType): NativeProject {
  const clip = (id: string, startSec: number, endSec: number): NativeClip => ({
    id, trackId: "t1", kind: "video", startSec, endSec,
    mediaInSec: 0, mediaAssetId: `asset-${id}`,
    transform: { x: 0, y: 0, w: W, h: H, rotationDeg: 0, opacity: 1 },
    fit: "cover", effects: [],
  });
  return {
    id: "tl", projectId: "p", version: 1, fps: 30, width: W, height: H,
    backgroundColor: "#000000", durationSec: 9.4,
    tracks: [{ id: "t1", kind: "video", name: "V1", order: 0, muted: false, locked: false, hidden: false }],
    // Post-ripple overlap: A ends at 5, B starts at 5 - 0.6
    clips: [clip("A", 0, 5), clip("B", 5 - DUR, 9.4)],
    transitions: [{ id: "tr1", trackId: "t1", fromClipId: "A", toClipId: "B", type, durationSec: DUR }],
  };
}

console.log("\n== the export now applies transitions at all ==");
{
  const p = makeProject("fade");
  const mid = resolveFrameAt(p, 5 - DUR / 2);
  check("both clips are layers mid-transition", mid.layers.length === 2,
    `got ${mid.layers.map((l) => l.clipId).join(",")}`);
  const a = mid.layers.find((l) => l.clipId === "A")!;
  const b = mid.layers.find((l) => l.clipId === "B")!;
  check("outgoing stays fully opaque", Math.abs(a.transform.opacity - 1) < 1e-9, `${a.transform.opacity}`);
  check("incoming is partially transparent (a real blend)",
    b.transform.opacity > 0.4 && b.transform.opacity < 0.6, `${b.transform.opacity}`);
  check("incoming paints ON TOP of outgoing", b.zOrder > a.zOrder, `A=${a.zOrder} B=${b.zOrder}`);
}

console.log("\n== progress is monotonic and bounded across the window ==");
{
  const p = makeProject("fade");
  let prev = -1, mono = true, bounded = true, frames = 0;
  for (let f = 0; f <= Math.round(9.4 * 30); f++) {
    const t = f / 30;
    const act = activeTransitionsAt(p, t);
    if (act.length === 0) continue;
    frames++;
    const pr = act[0].progress;
    if (pr < prev) mono = false;
    if (pr < 0 || pr > 1) bounded = false;
    prev = pr;
  }
  check("sampled across the window", frames >= Math.floor(DUR * 30) - 1, `frames=${frames}`);
  check("never goes backwards", mono);
  check("stays within [0,1]", bounded);
  check("half-open at the end (no duplicated frame)", activeTransitionsAt(p, 5).length === 0);
}

console.log("\n== outside the window nothing is altered ==");
{
  const p = makeProject("fade");
  const before = resolveFrameAt(p, 2);
  check("single clip before the overlap", before.layers.length === 1 && before.layers[0].clipId === "A");
  check("authored opacity untouched", before.layers[0].transform.opacity === 1);
  const after = resolveFrameAt(p, 7);
  check("single clip after the overlap", after.layers.length === 1 && after.layers[0].clipId === "B");
  check("no residual crop", after.layers[0].cropInsetPct === undefined);
}

console.log("\n== each transition type produces motion, not a cut ==");
for (const type of ["fade", "slide", "zoom", "wipe", "flip"] as TransitionType[]) {
  const p = makeProject(type);
  const q = [0.25, 0.5, 0.75].map((f) => {
    const fr = resolveFrameAt(p, 5 - DUR + DUR * f);
    const b = fr.layers.find((l) => l.clipId === "B")!;
    return {
      op: b.transform.opacity,
      x: b.transform.xPct,
      w: b.transform.wPct,
      crop: b.cropInsetPct ? b.cropInsetPct.left : null,
    };
  });
  // Something about the incoming layer must change across the window,
  // otherwise the "transition" is a hard cut.
  const varies =
    new Set(q.map((s) => `${s.op.toFixed(4)}|${s.x.toFixed(4)}|${s.w.toFixed(4)}|${s.crop}`)).size === 3;
  check(`${type}: incoming layer animates across the window`, varies, JSON.stringify(q));

  const styles = transitionLayerStyles(type, 0.5);
  check(`${type}: outgoing stays opaque (no mid-transition dip to black)`,
    styles.outgoing.opacity === 1, `${styles.outgoing.opacity}`);
  check(`${type}: incoming stacks above outgoing`, styles.incoming.zOrderBump > styles.outgoing.zOrderBump);
}

console.log("\n== wipe reveals progressively ==");
{
  const p = makeProject("wipe");
  const at = (f: number) => {
    const fr = resolveFrameAt(p, 5 - DUR + DUR * f);
    return fr.layers.find((l) => l.clipId === "B")!.cropInsetPct!;
  };
  const early = at(0.25), late = at(0.75);
  check("incoming is cropped from the left", early.left > late.left, `${early.left} -> ${late.left}`);
  check("reveal grows over time", early.left > 50 && late.left < 50, `${early.left}, ${late.left}`);
  const outA = resolveFrameAt(p, 5 - DUR * 0.5).layers.find((l) => l.clipId === "A")!.cropInsetPct!;
  check("outgoing is cropped from the opposite edge", outA.right > 0 && outA.left === 0, JSON.stringify(outA));
}

console.log("\n== degenerate transitions are ignored, not rendered broken ==");
{
  const p = makeProject("fade");
  p.clips[1].startSec = 5.0; // butt cut again: no overlap to blend
  check("no overlap => no transition", activeTransitionsAt(p, 4.8).length === 0);
  const p2 = makeProject("fade");
  p2.transitions[0].toClipId = "GONE";
  check("missing clip => no transition", activeTransitionsAt(p2, 4.8).length === 0);
  const p3 = makeProject("fade");
  p3.transitions[0].durationSec = 999;
  check("over-long duration is clamped, not fatal", activeTransitionsAt(p3, 4.9).length <= 1);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
