const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
    error: result.error,
  };
}

const configured = process.env.WHISPERX_COMMAND;
const local = path.join(process.cwd(), ".venv-whisperx", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "whisperx.exe" : "whisperx");

const candidates = [];
if (configured) {
  const parts = configured.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) || [];
  candidates.push({ label: configured, command: parts[0], args: [...parts.slice(1), "--help"] });
}
if (fs.existsSync(local)) candidates.push({ label: local, command: local, args: ["--help"] });
candidates.push({ label: "python -m whisperx", command: "python", args: ["-m", "whisperx", "--help"] });
candidates.push({ label: "whisperx", command: "whisperx", args: ["--help"] });

for (const candidate of candidates) {
  const result = run(candidate.command, candidate.args);
  if (result.ok) {
    console.log(`WhisperX OK: ${candidate.label}`);
    process.exit(0);
  }
  console.log(`WhisperX not available via ${candidate.label}`);
  if (result.output) console.log(result.output.split("\n").slice(-3).join("\n"));
  if (result.error) console.log(result.error.message);
}

console.error("\nWhisperX is required for exact subtitle sync.");
console.error("Recommended Windows setup:");
console.error("1. Install Python 3.10 or 3.11 from python.org and add it to PATH.");
console.error("2. Create a project venv: py -3.11 -m venv .venv-whisperx");
console.error("3. Install WhisperX: .venv-whisperx\\Scripts\\python -m pip install -U pip whisperx");
console.error("4. Restart the Next.js dev server, then run: npm run check:whisperx");
console.error("Alternative: set WHISPERX_COMMAND to your whisperx executable.");
process.exit(1);
