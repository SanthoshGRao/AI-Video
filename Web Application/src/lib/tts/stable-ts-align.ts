import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { WordTimestamp } from "@/lib/tts/types";
import { getFfmpegPath } from "@/lib/editor/ffmpeg";

function hasKannada(text: string): boolean {
  return /[\u0C80-\u0CFF]/.test(text);
}

function hasLatin(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

function whisperLanguage(languageCode: string | undefined, scriptText: string): string | null {
  if (!languageCode) return null;

  // Whisper language forcing is brittle for code-mixed Kannada + English.
  // Let Whisper auto-detect so English property terms do not get aligned as Kannada syllables.
  if (languageCode === "kn-IN" && hasKannada(scriptText) && hasLatin(scriptText)) {
    return null;
  }

  return languageCode.split("-")[0].toLowerCase();
}

function sanitizeAlignedWords(words: WordTimestamp[]): WordTimestamp[] {
  const out: WordTimestamp[] = [];
  let lastEnd = 0;

  for (const raw of words) {
    const word = raw.word.trim();
    if (!word) continue;

    let start = Number(raw.start);
    let end = Number(raw.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    start = Math.max(0, start);
    end = Math.max(start + 0.04, end);

    if (start < lastEnd - 0.02) start = lastEnd;
    if (end <= start) end = start + 0.08;

    out.push({ word, start, end });
    lastEnd = end;
  }

  return out;
}

function getSha256(...parts: Array<Buffer | string>): string {
  const hash = crypto.createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

function findMicrosoftStorePythonExe(): string | null {
  try {
    const appsDir = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps");
    if (!fs.existsSync(appsDir)) return null;
    const entries = fs.readdirSync(appsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("PythonSoftwareFoundation.Python.")) {
        const exe = path.join(appsDir, entry.name, "python.exe");
        if (fs.existsSync(exe)) return exe;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function getPythonExecutable(): string {
  const storePython = findMicrosoftStorePythonExe();
  if (storePython) return storePython;
  return "python";
}

export async function alignWordsWithStableTs(input: {
  audioBuffer: Buffer;
  scriptText: string;
  languageCode?: string;
  fileExtension: "mp3" | "wav";
  retries?: number;
}): Promise<WordTimestamp[]> {
  const retries = input.retries ?? 1;
  const hash = getSha256(
    "stable-ts-align-v2",
    input.audioBuffer,
    input.scriptText,
    input.languageCode ?? "auto"
  );
  
  // 1. Caching system
  const cacheDir = path.join(process.cwd(), "storage", "cache", "stable-ts");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const cachePath = path.join(cacheDir, `${hash}.json`);

  if (fs.existsSync(cachePath)) {
    console.log(`[stable-ts] Cache hit! Reusing timestamps for hash: ${hash}`);
    try {
      const cached = sanitizeAlignedWords(JSON.parse(fs.readFileSync(cachePath, "utf-8")) as WordTimestamp[]);
      if (cached && cached.length > 0) {
        return cached;
      }
    } catch (e) {
      console.warn(`[stable-ts] Failed to read cached timestamps:`, e);
    }
  }

  // 2. Prepare temp files
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stable-ts-align-"));
  const audioPath = path.join(tempDir, `audio.${input.fileExtension}`);
  fs.writeFileSync(audioPath, input.audioBuffer);

  const scriptPath = path.join(tempDir, "script.txt");
  fs.writeFileSync(scriptPath, input.scriptText.trim(), "utf-8");

  const outputPath = path.join(tempDir, "output.json");

  // Load configuration options
  const modelName = process.env.STABLE_TS_MODEL || "base";
  const pythonExe = getPythonExecutable();
  const scriptRunner = path.join(process.cwd(), "scripts", "align-stable-ts.py");

  const baseArgs = [
    scriptRunner,
    "--audio", audioPath,
    "--script", scriptPath,
    "--output", outputPath,
    "--model", modelName
  ];

  const lang = whisperLanguage(input.languageCode, input.scriptText);
  if (lang) {
    baseArgs.push("--language", lang);
  }

  let lastError = "";

  try {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[stable-ts] Attempt ${attempt} of ${retries} to run stable-ts alignment...`);

        const ffmpegDir = path.dirname(getFfmpegPath());
        const extendedPath = `${ffmpegDir}${path.delimiter}${process.env.PATH || ""}`;

        const ok = await new Promise<boolean>((resolve) => {
          const proc = spawn(pythonExe, baseArgs, {
            stdio: ["ignore", "pipe", "pipe"],
            shell: false,
            env: {
              ...process.env,
              PATH: extendedPath,
              PYTHONIOENCODING: "utf-8",
              PYTHONUTF8: "1"
            }
          });

          let stderr = "";
          proc.stdout?.resume();
          proc.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
          });

          proc.on("error", (error) => {
            lastError = error.message;
            resolve(false);
          });

          proc.on("close", (code) => {
            if (code === 0) {
              resolve(true);
            } else {
              lastError = stderr.trim() || `process exited with code ${code}`;
              resolve(false);
            }
          });
        });

        if (ok && fs.existsSync(outputPath)) {
          const words = sanitizeAlignedWords(JSON.parse(fs.readFileSync(outputPath, "utf-8")) as WordTimestamp[]);
          if (words && words.length > 0) {
            // Write to cache
            fs.writeFileSync(cachePath, JSON.stringify(words, null, 2), "utf-8");
            console.log(`[stable-ts] Alignment successful. Found ${words.length} words. Saved to cache.`);
            return words;
          }
          throw new Error("Alignment finished but JSON output was empty or invalid.");
        } else {
          throw new Error(lastError || "Alignment output file was not produced.");
        }

      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[stable-ts] Attempt ${attempt} failed: ${lastError}`);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }
      }
    }

    throw new Error(`stable-ts alignment failed after ${retries} attempts. Last error: ${lastError}`);

  } finally {
    // Cleanup temporary files
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
