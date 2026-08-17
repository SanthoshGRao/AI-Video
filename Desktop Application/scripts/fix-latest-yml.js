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
const exePath = path.join(releaseDir, exeName);

if (!fs.existsSync(exePath)) {
  console.error(`[fix-latest-yml] Error: Could not find installer at ${exePath}`);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(exePath);
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

console.log(`✔ [fix-latest-yml] Verified and updated latest.yml for ${exeName}:`);
console.log(`  Size: ${fileSize} bytes`);
console.log(`  SHA-512: ${fileHash}`);
