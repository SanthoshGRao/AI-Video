/** Verifies the render plan keeps BOTH transition clips and stacks incoming on top. */
import { buildCanvasRenderPlan } from "../../src/lib/editor-v2/editor/render-pipeline-debug";
import { PX_PER_SECOND } from "../../src/lib/editor-v2/editor-data";

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
};

const mk = (id: string, startSec: number, durSec: number, kind: "video" | "image") => ({
  id, name: id, kind, track: 1,
  start: startSec * PX_PER_SECOND, width: durSec * PX_PER_SECOND,
  color: "#fff", src: `file://${id}.mp4`, mediaStart: 0,
});

const DUR = 0.6;
function run(label: string, kindA: "video" | "image", kindB: "video" | "image") {
  console.log(`\n== ${label} ==`);
  const clips = [mk("A", 0, 5, kindA), mk("B", 5 - DUR, 4, kindB)] as never[];
  const tr = { id: "t1", kind: "fade", track: 1, start: (5 - DUR) * PX_PER_SECOND, duration: DUR, clipAId: "A", clipBId: "B" } as never;

  const plan = buildCanvasRenderPlan(clips, [], 4.7, [tr]);
  const a = plan.renderedItems.find((i) => i.clip.id === "A");
  const b = plan.renderedItems.find((i) => i.clip.id === "B");

  check("both clips rendered", !!a && !!b, `got ${plan.renderedItems.map((i) => i.clip.id).join(",")}`);
  check("incoming stacks above outgoing", !!a && !!b && (b!.zIndexOverride ?? 0) > (a!.zIndexOverride ?? 0),
    `A=${a?.zIndexOverride} B=${b?.zIndexOverride}`);
  check("incoming painted after outgoing (DOM order)",
    plan.renderedItems.findIndex((i) => i.clip.id === "B") > plan.renderedItems.findIndex((i) => i.clip.id === "A"));
  check("outgoing fully opaque, incoming ramping", a?.transitionStyle?.opacity === 1 && (b?.transitionStyle?.opacity ?? 0) > 0 && (b?.transitionStyle?.opacity ?? 1) < 1,
    `A.op=${a?.transitionStyle?.opacity} B.op=${b?.transitionStyle?.opacity}`);
  check("both source times are inside their clip", (a?.localTime ?? -1) >= 0 && (b?.localTime ?? -1) >= 0,
    `A@${a?.localTime} B@${b?.localTime}`);
  check("debug entry emitted", plan.transitionDebug.length === 1);

  // Outside the window: exactly one clip, no leftover transition styling.
  const after = buildCanvasRenderPlan(clips, [], 5.5, [tr]);
  check("after the window only the incoming clip renders",
    after.renderedItems.length === 1 && after.renderedItems[0].clip.id === "B",
    `got ${after.renderedItems.map((i) => i.clip.id).join(",")}`);
  check("no stale transition style after the window", after.renderedItems[0]?.transitionStyle === undefined);
}

run("video -> video", "video", "video");
// This is the case that used to render inverted: image priority (20) beat
// video (10), so the incoming video faded in BEHIND the opaque outgoing image.
run("image -> video (the inverted-stack case)", "image", "video");
run("video -> image", "video", "image");

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
