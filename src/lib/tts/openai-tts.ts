import type { VoicePersonaConfig } from "./voices";

export async function synthesizeWithOpenAITTS(
  text: string,
  voice: VoicePersonaConfig,
  apiKey: string
): Promise<{ buffer: Buffer; provider: "openai" }> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice: voice.gptVoice,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    let errorMsg = `OpenAI TTS API error: ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson.error?.message) {
        errorMsg += ` - ${errJson.error.message}`;
      }
    } catch {
      errorMsg += ` - ${await res.text()}`;
    }
    throw new Error(errorMsg);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { buffer, provider: "openai" };
}
