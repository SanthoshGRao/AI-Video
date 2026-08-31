/**
 * filtergraph-builder.ts — builds ONE ffmpeg filter_complex graph per
 * export from the canonical NativeProject, replacing Remotion's
 * per-frame headless-Chrome screenshot approach and the old fallback
 * path's 4-5 separate full re-encode passes with a single ffmpeg process.
 *
 * Known Phase-1 simplifications (documented, not silently swallowed):
 *  - Transitions are approximated via ffmpeg's `xfade` filter with a
 *    best-effort mapping from our transition types to xfade's named
 *    transitions (exact per-type curves are a Phase 2 GPU-compositor item).
 *  - `glow` and `lut` effects are not yet implemented (logged + skipped
 *    rather than failing the export).
 *  - Dedicated audio/voiceover-track clips AND video clips' own embedded
 *    audio (any track) are mixed into the export audio, when a video's
 *    source was confirmed via ffprobe to actually have an audio stream.
 *  - Text/shape clips render via ffmpeg's `drawtext`/`drawbox`, not the
 *    WebGL compositor (that lands in Phase 2 and replaces this).
 */

import type { NativeProject, NativeClip, NativeTrack, EffectInstance, TransitionType } from "../model/types";

export interface ResolvedMediaPath {
  mediaAssetId?: string;
  audioAssetId?: string;
  localPath: string;
  durationMs?: number | null;
  /** Only meaningful for a video's own media entry: whether the source file
   * has an audio stream at all. Required before mixing a video clip's own
   * audio in — referencing a nonexistent `[idx:a]` stream aborts the whole
   * ffmpeg filter graph, so an unprobed/false video is silently skipped
   * rather than assumed to have sound. */
  hasAudio?: boolean;
}

export interface BuildInput {
  project: NativeProject;
  media: ResolvedMediaPath[];
  canvasWidth: number;
  canvasHeight: number;
  fontFilePath?: string;
  /** Pre-escaped path from subtitles.ts writeAssFile().filterPath */
  subtitlesAssFilterPath?: string;
  /**
   * Build the audio graph only, emitting a minimal 1-frame black video pad
   * for `videoOutLabel` instead of the real compositing chain.
   *
   * audio-mix.ts is the only remaining caller of this builder and it throws
   * the video output away (`-map [vout] -f null NUL`), but the builder still
   * constructed the whole video chain — including a `drawtext` per text clip.
   * Since no caller ever set `fontFilePath`, that produced a
   * "No font file resolved — skipping text clip <id>" warning for every text
   * clip on every export: alarming, entirely spurious (those pixels were
   * discarded), and pure wasted work. Text is rendered by the GPU compositor
   * now — see the export-render-worker's text layers.
   */
  audioOnly?: boolean;
}

export interface FilterGraphPlan {
  inputArgs: string[];
  filterComplex: string;
  videoOutLabel: string;
  audioOutLabel: string | null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/\n/g, " ");
}

function presetToFilters(id: string): string[] {
  switch (id) {
    case "grayscale":
      return ["hue=s=0"];
    case "sepia":
      return ["colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0"];
    case "invert":
      return ["negate"];
    case "vintage":
      return ["curves=preset=vintage", "eq=saturation=0.8"];
    case "vivid":
      return ["eq=saturation=1.4:contrast=1.1"];
    case "cool":
      return ["colorbalance=rs=-0.10:gs=0.0:bs=0.10"];
    case "warm":
      return ["colorbalance=rs=0.10:gs=0.0:bs=-0.10"];
    default:
      return [];
  }
}

function effectsToFilters(effects: EffectInstance[]): string[] {
  const filters: string[] = [];
  for (const e of effects) {
    switch (e.type) {
      case "brightness":
        filters.push(`eq=brightness=${clamp(e.amount, -1, 1).toFixed(3)}`);
        break;
      case "contrast":
        filters.push(`eq=contrast=${clamp(1 + e.amount, 0, 3).toFixed(3)}`);
        break;
      case "saturation":
        filters.push(`eq=saturation=${clamp(1 + e.amount, 0, 3).toFixed(3)}`);
        break;
      case "hueRotate":
        filters.push(`hue=h=${e.amount.toFixed(1)}`);
        break;
      case "blur":
        filters.push(`gblur=sigma=${Math.max(0.1, e.radiusPx / 3).toFixed(2)}`);
        break;
      case "chromaKey":
        filters.push(
          `colorkey=color=${e.color.replace("#", "0x")}:similarity=${clamp(e.tolerance, 0.01, 1).toFixed(2)}:blend=0.05`
        );
        break;
      case "vignette":
        filters.push(`vignette=PI/${Math.max(2, (6 - e.strength * 4)).toFixed(2)}`);
        break;
      case "glow":
        console.warn("[filtergraph-builder] 'glow' effect not yet implemented — skipped");
        break;
      case "lut":
        console.warn("[filtergraph-builder] 'lut' effect not yet implemented — skipped");
        break;
      case "preset":
        filters.push(...presetToFilters(e.id));
        break;
    }
  }
  return filters;
}

const XFADE_TRANSITION_MAP: Record<TransitionType, string> = {
  fade: "fade",
  zoom: "fade",
  slide: "slideleft",
  blur: "fade",
  push: "slideleft",
  wipe: "wipeleft",
  flip: "fade",
};

interface ClipInputRef {
  clip: NativeClip;
  inputIndex: number;
  isImage: boolean;
}

export function buildFilterGraph(input: BuildInput): FilterGraphPlan {
  const { project, canvasWidth: W, canvasHeight: H } = input;
  const totalDur = Math.max(project.durationSec, 0.1);

  const inputArgs: string[] = [];
  const filterLines: string[] = [];
  const clipInput = new Map<string, ClipInputRef>();

  const mediaByAssetId = new Map(input.media.map((m) => [m.mediaAssetId ?? m.audioAssetId ?? "", m]));

  let nextInputIndex = 0;
  function addVideoInput(clip: NativeClip): number | null {
    const resolved = clip.mediaAssetId ? mediaByAssetId.get(clip.mediaAssetId) : undefined;
    if (!resolved) return null;
    const isImage = clip.kind === "image";
    if (isImage) {
      inputArgs.push("-loop", "1", "-t", (clip.endSec - clip.startSec).toFixed(3), "-i", resolved.localPath);
    } else {
      inputArgs.push("-i", resolved.localPath);
    }
    const idx = nextInputIndex++;
    clipInput.set(clip.id, { clip, inputIndex: idx, isImage });
    return idx;
  }

  function addAudioInput(clip: NativeClip): number | null {
    const resolved = clip.audioAssetId
      ? mediaByAssetId.get(clip.audioAssetId)
      : clip.mediaAssetId
        ? mediaByAssetId.get(clip.mediaAssetId)
        : undefined;
    if (!resolved) return null;
    inputArgs.push("-i", resolved.localPath);
    const idx = nextInputIndex++;
    return idx;
  }

  /** Produces a full-canvas RGBA label for a single clip's own duration
   * (positioned/scaled/effected), NOT yet padded to the full timeline. */
  function buildOwnDurationLayer(ref: ClipInputRef, label: string): string {
    const { clip, inputIndex, isImage } = ref;
    const t = clip.transform ?? { x: 0, y: 0, w: W, h: H, rotationDeg: 0, opacity: 1 };
    const clipDur = clip.endSec - clip.startSec;

    // Pad label (e.g. "[1:v]") must be glued directly onto the first filter
    // in the chain, not comma-joined as its own element — a bare label
    // followed by "," parses as an empty filter name ("No such filter: ''")
    // and ffmpeg rejects the whole -filter_complex argument. The image
    // branch used to push the label as its own chain[] entry, which
    // chain.join(",") then separated from "scale=..." with an invalid
    // comma; the video branch never had this bug because it always glues
    // the label onto "trim=...".
    const padLabel = `[${inputIndex}:v]`;
    const chain: string[] = [];
    if (!isImage) {
      const mediaIn = clip.mediaInSec ?? 0;
      chain.push(`trim=start=${mediaIn.toFixed(3)}:duration=${clipDur.toFixed(3)},setpts=PTS-STARTPTS`);
    }

    const scaleW = Math.max(2, Math.round(t.w));
    const scaleH = Math.max(2, Math.round(t.h));
    chain.push(`scale=${scaleW}:${scaleH}:force_original_aspect_ratio=disable`);
    chain.push("format=rgba");

    const effectFilters = effectsToFilters(clip.effects);
    chain.push(...effectFilters);

    if (t.rotationDeg) {
      chain.push(`rotate=${((t.rotationDeg * Math.PI) / 180).toFixed(4)}:c=black@0.0:ow=rotw(iw):oh=roth(ih)`);
    }
    if (t.opacity < 1) {
      chain.push(`colorchannelmixer=aa=${clamp(t.opacity, 0, 1).toFixed(3)}`);
    }

    const scaledLabel = `${label}_c`;
    filterLines.push(padLabel + chain.join(",") + `[${scaledLabel}]`);

    filterLines.push(
      `color=size=${W}x${H}:color=black@0.0:duration=${clipDur.toFixed(3)}:rate=${project.fps}[${label}_bg]`
    );
    filterLines.push(
      `[${label}_bg][${scaledLabel}]overlay=x=${Math.round(t.x)}:y=${Math.round(t.y)}:format=auto[${label}]`
    );

    return label;
  }

  /** Pads a clip-duration-length layer to the full project timeline,
   * transparent everywhere outside [startSec, endSec]. */
  function padToTimeline(sourceLabel: string, startSec: number, endSec: number, outLabel: string): void {
    const before = Math.max(0, startSec);
    const after = Math.max(0, totalDur - endSec);
    filterLines.push(
      `[${sourceLabel}]tpad=start_duration=${before.toFixed(3)}:stop_duration=${after.toFixed(3)}:color=black@0.0[${outLabel}]`
    );
  }

  // In audio-only mode the caller discards the video output, so skip the
  // entire visual chain (scale/overlay/drawtext/effects per clip) and leave
  // `composite` as the bare background pad. ffmpeg still needs *a* video
  // output label because the graph must have no unconnected pads.
  const buildVisuals = !input.audioOnly;

  // ---- Group clips per visual track, resolve transition pairs ----
  const transitionByClipId = new Map(project.transitions.map((tr) => [tr.fromClipId, tr]));
  const isTransitionTarget = new Set(project.transitions.map((tr) => tr.toClipId));

  const visualTracks = [...project.tracks]
    .filter((t) => t.kind !== "audio" && t.kind !== "voiceover" && !t.hidden)
    .sort((a, b) => a.order - b.order);

  let composite = "base";
  filterLines.push(`color=size=${W}x${H}:color=black:duration=${totalDur.toFixed(3)}:rate=${project.fps}[${composite}]`);

  let layerCounter = 0;

  for (const track of buildVisuals ? visualTracks : []) {
    const clips = project.clips
      .filter((c) => c.trackId === track.id)
      .sort((a, b) => a.startSec - b.startSec);

    for (const clip of clips) {
      if (isTransitionTarget.has(clip.id)) continue; // handled as part of its predecessor's transition

      if (clip.kind === "text" || clip.kind === "subtitle") {
        drawTextOnComposite(clip);
        continue;
      }
      if (clip.kind === "shape") {
        drawShapeOnComposite(clip);
        continue;
      }
      if (clip.kind !== "video" && clip.kind !== "image") continue;

      const inputIdx = addVideoInput(clip);
      if (inputIdx === null) continue;
      const ref = clipInput.get(clip.id)!;

      const transition = transitionByClipId.get(clip.id);
      const nextClip = transition ? project.clips.find((c) => c.id === transition.toClipId) : undefined;

      layerCounter++;
      const layerLabel = `layer${layerCounter}`;

      if (transition && nextClip && (nextClip.kind === "video" || nextClip.kind === "image")) {
        const nextIdx = addVideoInput(nextClip);
        if (nextIdx !== null) {
          const nextRef = clipInput.get(nextClip.id)!;
          const aLabel = buildOwnDurationLayer(ref, `${layerLabel}a`);
          const bLabel = buildOwnDurationLayer(nextRef, `${layerLabel}b`);
          const aDur = clip.endSec - clip.startSec;
          const offset = Math.max(0, aDur - transition.durationSec);
          const xfadeType = XFADE_TRANSITION_MAP[transition.type];
          filterLines.push(
            `[${aLabel}][${bLabel}]xfade=transition=${xfadeType}:duration=${transition.durationSec.toFixed(3)}:offset=${offset.toFixed(3)}[${layerLabel}]`
          );
          padToTimeline(layerLabel, clip.startSec, nextClip.endSec, `${layerLabel}_pad`);
          const nextComposite = `comp${layerCounter}`;
          filterLines.push(`[${composite}][${layerLabel}_pad]overlay=0:0[${nextComposite}]`);
          composite = nextComposite;
          continue;
        }
      }

      const ownLabel = buildOwnDurationLayer(ref, layerLabel);
      padToTimeline(ownLabel, clip.startSec, clip.endSec, `${layerLabel}_pad`);
      const nextComposite = `comp${layerCounter}`;
      filterLines.push(`[${composite}][${layerLabel}_pad]overlay=0:0[${nextComposite}]`);
      composite = nextComposite;
    }
  }

  function drawTextOnComposite(clip: NativeClip): void {
    if (!clip.text?.content) return;
    if (!input.fontFilePath) {
      console.warn(`[filtergraph-builder] No font file resolved — skipping text clip ${clip.id}`);
      return;
    }
    const t = clip.transform;
    const style = clip.text.style ?? {};
    const fontSize = typeof style.fontSize === "number" ? style.fontSize : Math.round(H * 0.05);
    const color = typeof style.color === "string" ? style.color.replace("#", "0x") : "0xFFFFFF";
    const x = t ? Math.round(t.x) : Math.round(W / 2);
    const y = t ? Math.round(t.y) : Math.round(H * 0.85);
    const fontArg = input.fontFilePath ? `fontfile='${input.fontFilePath.replace(/\\/g, "/").replace(/:/g, "\\:")}':` : "";
    const nextComposite = `text${layerCounter++}`;
    filterLines.push(
      `[${composite}]drawtext=${fontArg}text='${escapeDrawtext(clip.text.content)}':fontsize=${fontSize}:fontcolor=${color}:x=${x}:y=${y}:enable='between(t\\,${clip.startSec.toFixed(3)}\\,${clip.endSec.toFixed(3)})'[${nextComposite}]`
    );
    composite = nextComposite;
  }

  function drawShapeOnComposite(clip: NativeClip): void {
    const t = clip.transform;
    if (!t) return;
    const color = typeof clip.raw?.color === "string" ? String(clip.raw.color).replace("#", "0x") : "0xFFFFFF";
    const nextComposite = `shape${layerCounter++}`;
    filterLines.push(
      `[${composite}]drawbox=x=${Math.round(t.x)}:y=${Math.round(t.y)}:w=${Math.round(t.w)}:h=${Math.round(t.h)}:color=${color}@${t.opacity.toFixed(2)}:t=fill:enable='between(t\\,${clip.startSec.toFixed(3)}\\,${clip.endSec.toFixed(3)})'[${nextComposite}]`
    );
    composite = nextComposite;
  }

  if (input.subtitlesAssFilterPath) {
    const withSubs = "with_subs";
    filterLines.push(`[${composite}]subtitles='${input.subtitlesAssFilterPath}'[${withSubs}]`);
    composite = withSubs;
  }

  // ---- Audio: dedicated audio/voiceover clips, PLUS video clips' own
  // embedded audio (any video track — e.g. a video dragged onto a second/
  // overlay track previously produced no sound at all, since this loop used
  // to only look at "audio"-kind clips on "audio"/"voiceover" tracks). A
  // video clip's audio is only mixed in when the source was confirmed (via
  // ffprobe, see export-runner.ts) to actually have an audio stream —
  // referencing a stream that doesn't exist aborts the whole filter graph.
  const audioTracks = project.tracks.filter((t) => t.kind === "audio" || t.kind === "voiceover");
  const videoTracksForAudio = project.tracks.filter((t) => t.kind !== "audio" && t.kind !== "voiceover");
  const audioLabels: string[] = [];

  function mixClipAudio(clip: NativeClip): void {
    const idx = addAudioInput(clip);
    if (idx === null) return;
    const mediaIn = clip.mediaInSec ?? 0;
    const dur = clip.endSec - clip.startSec;
    const volume = clip.audio?.muted ? 0 : (clip.audio?.volume ?? 1);
    const fadeIn = clip.audio?.fadeInSec ?? 0;
    const fadeOut = clip.audio?.fadeOutSec ?? 0;
    const delayMs = Math.round(clip.startSec * 1000);
    const label = `a${audioLabels.length}`;

    const chain = [
      `[${idx}:a]atrim=start=${mediaIn.toFixed(3)}:duration=${dur.toFixed(3)}`,
      "asetpts=PTS-STARTPTS",
      `volume=${clamp(volume, 0, 4).toFixed(3)}`,
    ];
    if (fadeIn > 0) chain.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
    if (fadeOut > 0) chain.push(`afade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
    chain.push(`adelay=${delayMs}|${delayMs}`);
    filterLines.push(chain.join(",") + `[${label}]`);
    audioLabels.push(label);
  }

  for (const track of audioTracks) {
    const clips = project.clips.filter((c) => c.trackId === track.id && c.kind === "audio");
    for (const clip of clips) mixClipAudio(clip);
  }

  for (const track of videoTracksForAudio) {
    const clips = project.clips.filter((c) => c.trackId === track.id && c.kind === "video");
    for (const clip of clips) {
      const resolved = clip.mediaAssetId ? mediaByAssetId.get(clip.mediaAssetId) : undefined;
      if (!resolved?.hasAudio) continue;
      mixClipAudio(clip);
    }
  }

  let audioOutLabel: string | null = null;
  if (audioLabels.length > 0) {
    audioOutLabel = "aout";
    filterLines.push(
      `${audioLabels.map((l) => `[${l}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[${audioOutLabel}]`
    );
  }

  return {
    inputArgs,
    filterComplex: filterLines.join(";\n"),
    videoOutLabel: composite,
    audioOutLabel,
  };
}
