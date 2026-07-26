/**
 * audio-mix.ts — produces one pre-mixed audio track for the export, reusing
 * filtergraph-builder.ts's existing (already-correct) audio filter graph
 * rather than reimplementing volume/fade/mix logic.
 *
 * Only the AUDIO output is muxed to a real file — no video decoding,
 * filtering or encoding runs: this passes `audioOnly`, so buildFilterGraph()
 * skips the whole visual chain and emits just a background pad for its video
 * output label (ffmpeg rejects a graph with an unconnected output pad, so
 * *some* video label must exist; it is routed to a null muxer below).
 *
 * Before `audioOnly` existed this built and ran the full compositing chain —
 * scale/overlay/effects for every clip plus a `drawtext` per text clip —
 * purely to throw the result away, which is also where the spurious
 * "No font file resolved — skipping text clip" warnings came from.
 *
 * This is intentional, not a shortcut: audio processing was always meant to
 * stay on FFmpeg (per the compositor-owns-video / ffmpeg-owns-audio split);
 * only VIDEO compositing needed to move to the GPU compositor.
 */
import { spawn } from "child_process";
import path from "path";
import { buildFilterGraph, type BuildInput } from "./filtergraph-builder";

export async function mixProjectAudio(
  ffmpegPath: string,
  input: BuildInput,
  outputDir: string,
  jobId: string,
): Promise<string | null> {
  const plan = buildFilterGraph({ ...input, audioOnly: true });
  if (!plan.audioOutLabel) return null;

  const outPath = path.join(outputDir, `audio-${jobId}.m4a`);
  const args = [
    "-y",
    ...plan.inputArgs,
    "-filter_complex", plan.filterComplex,
    "-map", `[${plan.audioOutLabel}]`,
    "-c:a", "aac",
    "-b:a", "192k",
    outPath,
    // buildFilterGraph() always constructs the full video compositing chain
    // even though we only want its audio output — ffmpeg's filter parser
    // rejects a graph with an unconnected/unmapped output pad ("Filter ...
    // has an unconnected output"), so the unused video output has to be
    // routed somewhere. A second output muxed to null discards it cheaply
    // without actually encoding it.
    "-map", `[${plan.videoOutLabel}]`,
    "-f", "null",
    process.platform === "win32" ? "NUL" : "/dev/null",
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderrTail = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Audio mix ffmpeg exited with code ${code}: ${stderrTail.slice(-800)}`));
    });
  });

  return outPath;
}
