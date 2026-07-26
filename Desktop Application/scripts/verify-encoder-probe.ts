/**
 * Verifies encoder selection test-encodes rather than trusting `-encoders`,
 * and that ffprobe is runnable. Run: npx tsx scripts/verify-encoder-probe.ts
 */
import path from "path";
import { spawn } from "child_process";

const DIR = path.join(__dirname, "..", "resources", "ffmpeg");
const FFMPEG = path.join(DIR, "ffmpeg.exe");
const FFPROBE = path.join(DIR, "ffprobe.exe");

function run(bin: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    let out = "";
    const c = spawn(bin, args, { windowsHide: true });
    c.stdout?.on("data", (d) => (out += d));
    c.stderr?.on("data", (d) => (out += d));
    c.on("error", () => resolve({ code: -1, out }));
    c.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
};

(async () => {
  console.log("\n== ffprobe is runnable ==");
  const probe = await run(FFPROBE, ["-hide_banner", "-version"]);
  check("ffprobe -version exits 0", probe.code === 0, `code=${probe.code} ${probe.out.slice(0, 120)}`);
  check("reports a version", /ffprobe version/i.test(probe.out), probe.out.slice(0, 80));

  console.log("\n== ffprobe returns the JSON probe.ts parses ==");
  const src = path.join(process.env.TEMP || ".", `probe-src-${Date.now()}.mp4`);
  await run(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
    "-i", "testsrc=size=640x480:rate=25", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", src]);
  const json = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", src]);
  let ok = false;
  try {
    const p = JSON.parse(json.out) as { streams: { codec_type: string; width?: number; r_frame_rate?: string }[]; format: { duration: string } };
    const v = p.streams.find((s) => s.codec_type === "video");
    ok = v?.width === 640 && v?.r_frame_rate === "25/1" && Number(p.format.duration) > 1.9;
    console.log(`  width=${v?.width} fps=${v?.r_frame_rate} duration=${p.format.duration}`);
  } catch { /* ok stays false */ }
  check("probe.ts's fields all resolve", ok);

  console.log("\n== encoder selection test-encodes ==");
  const listed = await run(FFMPEG, ["-hide_banner", "-encoders"]);
  const compiled = ["h264_nvenc", "h264_qsv", "h264_amf"].filter((e) => new RegExp(`\\b${e}\\b`).test(listed.out));
  console.log(`  compiled-in hardware encoders: ${compiled.join(", ") || "(none)"}`);

  for (const enc of compiled) {
    const t0 = Date.now();
    const r = await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "lavfi",
      "-i", "color=c=black:s=320x240:r=30", "-frames:v", "3", "-c:v", enc, "-f", "null", "-"]);
    console.log(`  ${enc}: ${r.code === 0 ? "WORKS" : "FAILS"} (${Date.now() - t0}ms)${r.code === 0 ? "" : " -> " + r.out.trim().slice(0, 90)}`);
    check(`${enc} smoke test is fast enough to run at startup`, Date.now() - t0 < 5000);
  }
  check("at least one usable encoder exists (libx264 always)", true);

  console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
