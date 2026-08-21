const MAX_CHUNK_BYTES = 4000;

/** Split script into TTS-safe chunks (sentences, then byte limit). */
export function splitForTts(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const part = sentence.trim();
    if (!part) continue;
    const candidate = current ? `${current} ${part}` : part;
    if (Buffer.byteLength(candidate, "utf8") <= MAX_CHUNK_BYTES) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      if (Buffer.byteLength(part, "utf8") <= MAX_CHUNK_BYTES) {
        current = part;
      } else {
        chunks.push(...splitByBytes(part));
        current = "";
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitByBytes(text: string): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buf = "";
  for (const w of words) {
    const next = buf ? `${buf} ${w}` : w;
    if (Buffer.byteLength(next, "utf8") > MAX_CHUNK_BYTES) {
      if (buf) out.push(buf);
      buf = w;
    } else {
      buf = next;
    }
  }
  if (buf) out.push(buf);
  return out;
}
