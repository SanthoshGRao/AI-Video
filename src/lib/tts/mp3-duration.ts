export function estimateMp3DurationMs(buffer: Buffer): number {
  const wavDurationMs = estimateWavDurationMs(buffer);
  if (wavDurationMs > 0) return wavDurationMs;

  if (!buffer || buffer.length < 10) return 0;
  
  let offset = 0;
  // Skip ID3v2 tag if present
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const size =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    offset = 10 + size;
  }

  const bitrates = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0
  ];
  const sampleRates = [44100, 48000, 32000, 0];

  let durationMs = 0;

  while (offset < buffer.length - 4) {
    if (buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0) {
      const version = (buffer[offset + 1] >> 3) & 3;
      const layer = (buffer[offset + 1] >> 1) & 3;
      
      // MPEG Version 1 or 2/2.5. Layer III is 1
      if (version === 1 || layer !== 1) { 
        // fallback or continue
      }
      
      const bitrateIdx = (buffer[offset + 2] >> 4) & 0x0f;
      const sampleRateIdx = (buffer[offset + 2] >> 2) & 0x03;
      const padding = (buffer[offset + 2] >> 1) & 0x01;

      let kbps = bitrates[bitrateIdx];
      let hz = sampleRates[sampleRateIdx];

      // Adjust for MPEG 2/2.5
      if (version === 2 || version === 0) {
        hz >>= 1; // half sample rate for MPEG 2
        if (version === 0) hz >>= 1; // quarter for MPEG 2.5
        const mpeg2Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
        kbps = mpeg2Bitrates[bitrateIdx];
      }

      if (kbps === 0 || hz === 0) {
        offset++;
        continue;
      }

      // Samples per frame for MPEG-1 Layer 3 is 1152. For MPEG-2 it's 576.
      const samplesPerFrame = (version === 3) ? 1152 : 576;
      const frameDurationMs = (samplesPerFrame / hz) * 1000;
      
      durationMs += frameDurationMs;

      // Frame size calculation
      const frameSize = Math.floor((samplesPerFrame / 8 * kbps * 1000) / hz) + padding;
      
      offset += frameSize;
    } else {
      offset++;
    }
  }

  return durationMs > 0 ? Math.round(durationMs) : 0;
}

function estimateWavDurationMs(buffer: Buffer): number {
  if (!buffer || buffer.length < 44) return 0;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return 0;
  }

  const byteRate = buffer.readUInt32LE(28);
  if (byteRate <= 0) return 0;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return Math.round((chunkSize / byteRate) * 1000);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return 0;
}
