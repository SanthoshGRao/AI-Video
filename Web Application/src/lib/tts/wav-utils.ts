/**
 * Tiny PCM/WAV helpers for the Skit Studio conversation preview.
 *
 * Gemini flash-TTS returns each line as a mono 16-bit PCM WAV (see
 * `normalizeGeminiAudio` in google-cloud-tts.ts). To offer a single
 * "download the whole conversation" file we stitch those per-line WAVs
 * together with a short silence between turns. Playback in the browser is
 * done clip-by-clip (so we can highlight the active speaker), so this
 * concatenation is only for the combined download / scrubbing convenience.
 */

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Raw PCM sample bytes (the contents of the `data` chunk). */
  data: Buffer;
}

export function isWav(buffer: Buffer): boolean {
  return (
    buffer.length > 44 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

/**
 * Parse a canonical WAV. Scans the chunk list for `fmt ` and `data` rather than
 * assuming a fixed 44-byte header, so it survives an extra metadata chunk.
 */
export function readWav(buffer: Buffer): WavInfo | null {
  if (!isWav(buffer)) return null;

  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let data: Buffer | null = null;

  let offset = 12; // skip "RIFF"<size>"WAVE"
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (chunkId === "fmt " && body + 16 <= buffer.length) {
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (chunkId === "data") {
      data = buffer.subarray(body, Math.min(body + chunkSize, buffer.length));
    }

    // Chunks are word-aligned (padded to an even byte count).
    offset = body + chunkSize + (chunkSize % 2);
  }

  if (!data) return null;
  return { sampleRate, channels, bitsPerSample, data };
}

function wavHeader(dataLength: number, info: Omit<WavInfo, "data">): Buffer {
  const { sampleRate, channels, bitsPerSample } = info;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

/** Duration in ms from a WAV's data-chunk length. Returns 0 if not a WAV. */
export function wavDurationMs(buffer: Buffer): number {
  const info = readWav(buffer);
  if (!info) return 0;
  const bytesPerSample = (info.channels * info.bitsPerSample) / 8;
  if (bytesPerSample === 0) return 0;
  const samples = info.data.length / bytesPerSample;
  return Math.round((samples / info.sampleRate) * 1000);
}

function silencePcm(ms: number, info: Omit<WavInfo, "data">): Buffer {
  const bytesPerSample = (info.channels * info.bitsPerSample) / 8;
  const samples = Math.round((info.sampleRate * ms) / 1000);
  return Buffer.alloc(samples * bytesPerSample); // zero-filled = silence
}

/**
 * Concatenate WAV buffers (assumed same format — they come from one TTS model)
 * into a single WAV. `gaps` is the silence (ms) inserted BEFORE each clip:
 * pass a single number for a uniform gap between clips, or an array where
 * `gaps[i]` is the lead silence before clip i (so pauses/beats land exactly).
 * Returns null if any buffer isn't a readable WAV, so the caller can fall back
 * to per-clip playback.
 */
export function concatWav(buffers: Buffer[], gaps: number | number[] = 220): Buffer | null {
  if (buffers.length === 0) return null;

  const parsed = buffers.map(readWav);
  if (parsed.some((p) => p === null)) return null;
  const infos = parsed as WavInfo[];

  const base = { sampleRate: infos[0].sampleRate, channels: infos[0].channels, bitsPerSample: infos[0].bitsPerSample };
  const leadMs = (i: number): number =>
    Array.isArray(gaps) ? gaps[i] ?? 0 : i > 0 ? gaps : 0;

  const chunks: Buffer[] = [];
  infos.forEach((info, i) => {
    const ms = leadMs(i);
    if (ms > 0) chunks.push(silencePcm(ms, base));
    chunks.push(info.data);
  });

  const data = Buffer.concat(chunks);
  return Buffer.concat([wavHeader(data.length, base), data]);
}
