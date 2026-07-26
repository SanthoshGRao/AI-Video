/**
 * Verifies that a dying encoder reports WHY it died, rather than the useless
 * "encoder stdin is closed" that classified as UNKNOWN.
 * Run: npx tsx scripts/verify-encoder-errors.ts
 */
import path from "path";
import fs from "fs";
import os from "os";
import { EncodePipeline } from "../src/editor/export/encode-pipeline";
import { classifyExportError } from "../src/editor/diagnostics/export-error-taxonomy";

const FFMPEG = path.join(__dirname, "..", "resources", "ffmpeg", "ffmpeg.exe");
const W = 320;
const H = 240;

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
};

async function expectFailure(label: string, outputPath: string) {
  console.log(`\n== ${label} ==`);
  const pipe = new EncodePipeline({
    ffmpegPath: FFMPEG,
    width: W, height: H, fps: 30,
    encoder: "libx264", format: "mp4",
    outputPath,
    totalDurationSec: 1,
  });

  const frame = Buffer.alloc(W * H * 4, 0x40);
  let message = "";
  try {
    for (let i = 0; i < 120; i++) await pipe.writeFrame(frame);
    await pipe.finish();
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }

  const flat = message.replace(/\s+/g, " ");
  console.log(`  message head: ${flat.slice(0, 90)}`);
  console.log(`  message TAIL: ...${flat.slice(-160)}`);
  check("export failed as expected", message.length > 0);
  check("message is not the bare pipe error", message !== "encoder stdin is closed", message);
  check("message carries ffmpeg's own words", /ffmpeg|No such file|Error|Invalid|Permission/i.test(message));
  const classified = classifyExportError(message);
  console.log(`  classified: ${classified.code}`);
  check("classifies to something actionable, not UNKNOWN", classified.code !== "UNKNOWN", classified.code);
}

async function expectSuccess() {
  console.log("\n== healthy encode still works ==");
  const out = path.join(os.tmpdir(), `enc-ok-${Date.now()}.mp4`);
  const pipe = new EncodePipeline({
    ffmpegPath: FFMPEG,
    width: W, height: H, fps: 30,
    encoder: "libx264", format: "mp4",
    outputPath: out,
    totalDurationSec: 1,
  });
  const frame = Buffer.alloc(W * H * 4, 0x80);
  for (let i = 0; i < 30; i++) await pipe.writeFrame(frame);
  await pipe.finish();
  const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
  check("produced a non-empty file", size > 1000, `size=${size}`);
  try { fs.unlinkSync(out); } catch { /* ignore */ }
}

/**
 * The reported production failure: the mixed audio track is SHORTER than the
 * timeline. `-shortest` used to end the whole output at the audio's end, so
 * ffmpeg finished and closed stdin while the render loop was still sending
 * frames — surfacing as "encoder stdin is closed" on an encode that had
 * actually succeeded, at a video truncated to the audio length.
 */
async function shortAudioKeepsFullVideo() {
  console.log("\n== audio shorter than video (the reported failure) ==");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enc-audio-"));
  const audio = path.join(dir, "short.m4a");
  const out = path.join(dir, "out.mp4");

  // 2 s of silence, against 5 s of video.
  const { spawnSync } = await import("child_process");
  spawnSync(FFMPEG, [
    "-y", "-hide_banner", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
    "-t", "2", "-c:a", "aac", audio,
  ]);
  const VIDEO_SEC = 5;
  const FPS = 30;

  const pipe = new EncodePipeline({
    ffmpegPath: FFMPEG,
    width: W, height: H, fps: FPS,
    encoder: "libx264", format: "mp4",
    outputPath: out,
    audioPath: audio,
    totalDurationSec: VIDEO_SEC,
  });

  const frame = Buffer.alloc(W * H * 4, 0x60);
  let error = "";
  try {
    for (let i = 0; i < VIDEO_SEC * FPS; i++) await pipe.writeFrame(frame);
    await pipe.finish();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  check("export did NOT fail", error === "", error.slice(0, 160));

  // Measured with ffmpeg, not ffprobe: the bundled ffprobe.exe is a 168 KB
  // shared-library build with none of its DLLs present, so it cannot run.
  const probe = spawnSync(FFMPEG, ["-hide_banner", "-i", out], { encoding: "utf8" });
  const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(probe.stderr || "");
  const duration = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  console.log(`  output duration: ${duration}s (video ${VIDEO_SEC}s, audio 2s)`);
  check("output is the full VIDEO length, not truncated to the audio", Math.abs(duration - VIDEO_SEC) < 0.35,
    `got ${duration}`);

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

(async () => {
  if (!fs.existsSync(FFMPEG)) {
    console.log("ffmpeg not bundled; skipping");
    process.exit(0);
  }
  await shortAudioKeepsFullVideo();
  // Output directory does not exist -> ffmpeg exits early, so the frame loop
  // hits a closed stdin. This is exactly the shape of the reported failure.
  await expectFailure(
    "encoder dies mid-write (unwritable output path)",
    path.join(os.tmpdir(), `no-such-dir-${Date.now()}`, "out.mp4"),
  );
  await expectSuccess();
  console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
