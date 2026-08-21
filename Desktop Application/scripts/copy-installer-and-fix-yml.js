import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.resolve(__dirname, "..", "release");
const pkgPath = path.resolve(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version;
const exeName = `Video-Studio-Setup-${version}.exe`;
const targetExePath = path.join(releaseDir, exeName);

let foundPath = fs.existsSync(targetExePath) ? targetExePath : null;

if (!foundPath && fs.existsSync("D:\\temp")) {
  const subdirs = fs.readdirSync("D:\\temp");
  for (const dir of subdirs) {
    const candidate = path.join("D:\\temp", dir, exeName);
    if (fs.existsSync(candidate)) {
      foundPath = candidate;
      break;
    }
  }
}

if (!foundPath) {
  console.error(`[copy-installer-and-fix-yml] Could not find ${exeName} anywhere.`);
  process.exit(1);
}

if (foundPath !== targetExePath) {
  console.log(`[copy-installer-and-fix-yml] Copying ${foundPath} -> ${targetExePath}...`);
  fs.copyFileSync(foundPath, targetExePath);
}

const fileBuffer = fs.readFileSync(targetExePath);
const fileSize = fileBuffer.length;
const fileHash = crypto.createHash("sha512").update(fileBuffer).digest("base64");

const ymlContent = `version: ${version}
files:
  - url: ${exeName}
    sha512: ${fileHash}
    size: ${fileSize}
path: ${exeName}
sha512: ${fileHash}
releaseDate: '${new Date().toISOString()}'
`;

const ymlPath = path.join(releaseDir, "latest.yml");
fs.writeFileSync(ymlPath, ymlContent, "utf8");

console.log(`✔ [copy-installer-and-fix-yml] Successfully created latest.yml and installer for ${exeName}:`);
console.log(`  File: ${targetExePath}`);
console.log(`  Size: ${fileSize} bytes`);
console.log(`  SHA-512: ${fileHash}`);
