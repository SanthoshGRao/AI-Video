/**
 * Standalone verification of the transition timing contract.
 * Run: npx tsx <this file>
 */
import { PX_PER_SECOND } from "../../src/lib/editor-v2/editor-data";
import {
  transitionWindow,
  transitionPairAtPlayhead,
  transitioningClipIds,
  clampTransitionSec,
} from "../../src/lib/editor-v2/transition-runtime";

type C = { id: string; kind: string; track: number; start: number; width: number };
const clip = (id: string, startSec: number, durSec: number, kind = "video"): C => ({
  id,
  kind,
  track: 1,
  start: startSec * PX_PER_SECOND,
  width: durSec * PX_PER_SECOND,
});

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

const DUR = 0.6;
// Post-ripple layout: A = [0,5), B pulled left to start at 5 - 0.6 = 4.4
const A = clip("A", 0, 5);
const B = clip("B", 5 - DUR, 4);
const clips = [A, B] as never[];
const tr = { id: "t1", kind: "fade", track: 1, start: B.start, duration: DUR, clipAId: "A", clipBId: "B" } as never;

console.log("\n== window ==");
const win = transitionWindow(tr, clips)!;
check("window exists", !!win);
check("starts at B.start", Math.abs(win.startSec - 4.4) < 1e-9, `got ${win?.startSec}`);
check("ends at A.end", Math.abs(win.endSec - 5) < 1e-9, `got ${win?.endSec}`);
check("duration preserved", Math.abs(win.durationSec - DUR) < 1e-9, `got ${win?.durationSec}`);

console.log("\n== progress is monotonic, bounded, never resets ==");
let prev = -1;
let monotonic = true;
let bounded = true;
let sampled = 0;
const fps = 30;
for (let f = 0; f <= Math.round(6 * fps); f++) {
  const t = f / fps;
  const pair = transitionPairAtPlayhead(tr, clips, t);
  if (!pair) continue;
  sampled++;
  if (pair.progress < prev) monotonic = false;
  if (pair.progress < 0 || pair.progress > 1) bounded = false;
  prev = pair.progress;
}
check("progress sampled over the window", sampled >= Math.floor(DUR * fps) - 1, `frames=${sampled}`);
check("progress never goes backwards", monotonic);
check("progress stays within [0,1]", bounded);
check("progress starts at 0", Math.abs(transitionPairAtPlayhead(tr, clips, 4.4)!.progress) < 1e-9);
check("window is half-open at the end (no duplicate frame)", transitionPairAtPlayhead(tr, clips, 5.0) === null);
check("nothing before the window", transitionPairAtPlayhead(tr, clips, 4.399) === null);

console.log("\n== both clips are decodable for the WHOLE window ==");
let bothInRange = true;
for (let f = 0; f <= Math.round(DUR * fps); f++) {
  const t = 4.4 + f / fps;
  const pair = transitionPairAtPlayhead(tr, clips, t);
  if (!pair) continue;
  const aLocal = t - A.start / PX_PER_SECOND;
  const bLocal = t - B.start / PX_PER_SECOND;
  const aOk = aLocal >= 0 && aLocal <= A.width / PX_PER_SECOND;
  const bOk = bLocal >= 0 && bLocal <= B.width / PX_PER_SECOND;
  if (!aOk || !bOk) {
    bothInRange = false;
    console.log(`    t=${t.toFixed(3)} aLocal=${aLocal.toFixed(3)} bLocal=${bLocal.toFixed(3)}`);
  }
}
check("A and B both inside their own trimmed range every frame", bothInRange);
check("both ids reported as transitioning", transitioningClipIds([tr], clips, 4.5).size === 2);

console.log("\n== degenerate / stale cases are rejected, not rendered broken ==");
const shortB = clip("Bs", 5 - DUR, 0.05);
check(
  "transition longer than a clip is clamped",
  clampTransitionSec(DUR, A as never, shortB as never) <= 0.05 + 1e-9,
);
const detached = [A, clip("B", 9, 4)] as never[];
check("no overlap left => no transition", transitionWindow(tr, detached) === null);
check("missing clip => no transition", transitionWindow(tr, [A] as never[]) === null);

console.log("\n== old centred-window model would have failed this ==");
const centredStart = 5 - DUR / 2;
const bLocalAtCentredStart = centredStart - 5; // B started at 5 under a butt cut
console.log(`  (butt cut) B local time at old window start = ${bLocalAtCentredStart.toFixed(3)}s  <- negative = no frame`);
check("old model produced a negative source time", bLocalAtCentredStart < 0);

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
