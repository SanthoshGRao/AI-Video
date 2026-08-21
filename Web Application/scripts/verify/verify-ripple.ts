/** Verifies addTransition/removeTransition ripple the timeline into (and out of) a real overlap. */
import { useEditor } from "../../src/lib/editor-v2/editor-store";
import { PX_PER_SECOND } from "../../src/lib/editor-v2/editor-data";
import { transitionWindow, transitionPairAtPlayhead } from "../../src/lib/editor-v2/transition-runtime";

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
};

const s = useEditor.getState();
const mk = (id: string, startSec: number, durSec: number) => ({
  id, name: id, kind: "video" as const, track: 1,
  start: startSec * PX_PER_SECOND, width: durSec * PX_PER_SECOND,
  color: "#fff", src: `file://${id}.mp4`, mediaStart: 0,
});

// A=[0,5) B=[5,9) C=[9,12)  — butt cuts, as the timeline looks before a transition.
useEditor.setState({ clips: [mk("A", 0, 5), mk("B", 5, 4), mk("C", 9, 3)] as never, transitions: [] });

const DUR = 0.6;
const id = useEditor.getState().addTransition({
  kind: "fade", track: 1, start: 5 * PX_PER_SECOND, duration: DUR, clipAId: "A", clipBId: "B",
} as never);
check("transition created", !!id);

const st = useEditor.getState();
const get = (cid: string) => st.clips.find((c) => c.id === cid)!;
const sec = (px: number) => px / PX_PER_SECOND;

console.log("\n== ripple ==");
check("A unmoved", Math.abs(sec(get("A").start) - 0) < 1e-9, `got ${sec(get("A").start)}`);
check("B pulled left by the transition duration", Math.abs(sec(get("B").start) - 4.4) < 1e-9, `got ${sec(get("B").start)}`);
check("C rippled too (no gap opened)", Math.abs(sec(get("C").start) - 8.4) < 1e-9, `got ${sec(get("C").start)}`);
check("A and B genuinely overlap", sec(get("B").start) < sec(get("A").start + get("A").width));
check(
  "overlap length == transition duration",
  Math.abs(sec(get("A").start + get("A").width) - sec(get("B").start) - DUR) < 1e-9,
);

console.log("\n== runtime agrees with the rippled layout ==");
const tr = st.transitions.find((t) => t.id === id)!;
const win = transitionWindow(tr, st.clips)!;
check("window resolves", !!win);
check("window == overlap", !!win && Math.abs(win.startSec - 4.4) < 1e-9 && Math.abs(win.endSec - 5) < 1e-9);
check("midpoint progress ~0.5", Math.abs(transitionPairAtPlayhead(tr, st.clips, 4.7)!.progress - 0.5) < 1e-9);

console.log("\n== timeline duration shortened by exactly one transition ==");
const end = Math.max(...st.clips.map((c) => sec(c.start + c.width)));
check("total 12s -> 11.4s", Math.abs(end - 11.4) < 1e-9, `got ${end}`);

console.log("\n== remove ripples back to the butt cut ==");
useEditor.getState().removeTransition(id);
const st2 = useEditor.getState();
const get2 = (cid: string) => st2.clips.find((c) => c.id === cid)!;
check("B back at 5s", Math.abs(sec(get2("B").start) - 5) < 1e-9, `got ${sec(get2("B").start)}`);
check("C back at 9s", Math.abs(sec(get2("C").start) - 9) < 1e-9, `got ${sec(get2("C").start)}`);
check("transition gone", st2.transitions.length === 0);

console.log("\n== too-short clips are refused, not silently broken ==");
useEditor.setState({ clips: [mk("X", 0, 5), mk("Y", 5, 0.05)] as never, transitions: [] });
const bad = useEditor.getState().addTransition({
  kind: "fade", track: 1, start: 5 * PX_PER_SECOND, duration: DUR, clipAId: "X", clipBId: "Y",
} as never);
check("rejected", bad === "");
check("clips untouched", useEditor.getState().clips.find((c) => c.id === "Y")!.start === 5 * PX_PER_SECOND);

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
