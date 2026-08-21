import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Readable } from "stream";
import type { VoicePersonaConfig } from "@/lib/tts/voices";

/** Map language codes to Edge neural voices (free Microsoft Edge Read Aloud). */
const EDGE_VOICE_BY_LANG: Record<string, string> = {
  "kn-IN": "kn-IN-SapnaNeural",
  "hi-IN": "hi-IN-SwaraNeural",
  "en-US": "en-US-GuyNeural",
  "en-GB": "en-GB-RyanNeural",
};

function resolveEdgeVoiceName(voice: VoicePersonaConfig): string {
  if (voice.edgeVoiceId) return voice.edgeVoiceId;
  return EDGE_VOICE_BY_LANG[voice.languageCode] ?? "en-IN-NeerjaNeural";
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function synthesizeEdgeSpeech(options: {
  text: string;
  voice: VoicePersonaConfig;
}): Promise<Buffer> {
  const voiceName = resolveEdgeVoiceName(options.voice);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    voiceName,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
  );

  const { audioStream } = tts.toStream(options.text);
  const buffer = await streamToBuffer(audioStream);
  tts.close();

  if (buffer.length === 0) {
    throw new Error("Edge TTS returned empty audio");
  }
  return buffer;
}
