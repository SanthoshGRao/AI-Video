import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves the Windows installer for the landing page's download buttons.
 *
 * Resolution order:
 *   1. `WINDOWS_DOWNLOAD_URL` — redirect to a hosted asset (GitHub Release / CDN).
 *      This is what production should use; the installer is ~320MB and is not
 *      committed to the repo.
 *   2. A local build under `WINDOWS_SETUP_PATH` (file or directory), defaulting
 *      to `../Desktop Application/release` — so the page works during local dev
 *      right after `electron-builder` runs.
 *
 * `?meta=1` returns `{ version, sizeBytes, source }` instead of the bytes, which
 * the CTA uses to display the real version/size rather than a hardcoded string.
 */

const DEFAULT_RELEASE_DIR = path.resolve(process.cwd(), "..", "Desktop Application", "release");

type Installer = { filePath: string; fileName: string; size: number; version: string };

function parseVersion(fileName: string): string {
  return /(\d+\.\d+\.\d+(?:-[\w.]+)?)/.exec(fileName)?.[1] ?? "latest";
}

/** Finds the newest `*.exe` installer, ignoring electron-builder's sidecar files. */
async function findInstaller(): Promise<Installer | null> {
  const configured = process.env.WINDOWS_SETUP_PATH?.trim();
  const target = configured ? path.resolve(configured) : DEFAULT_RELEASE_DIR;

  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return null;
  }

  if (stat.isFile()) {
    const fileName = path.basename(target);
    return { filePath: target, fileName, size: stat.size, version: parseVersion(fileName) };
  }

  let entries: string[];
  try {
    entries = await fs.readdir(target);
  } catch {
    return null;
  }

  const candidates = await Promise.all(
    entries
      .filter((n) => n.toLowerCase().endsWith(".exe"))
      .map(async (name) => {
        const filePath = path.join(target, name);
        const s = await fs.stat(filePath).catch(() => null);
        return s?.isFile()
          ? { filePath, fileName: name, size: s.size, mtime: s.mtimeMs, version: parseVersion(name) }
          : null;
      })
  );

  const found = candidates.filter((c): c is NonNullable<typeof c> => c !== null);
  if (found.length === 0) return null;

  found.sort((a, b) => b.mtime - a.mtime);
  const { filePath, fileName, size, version } = found[0];
  return { filePath, fileName, size, version };
}

export async function GET(request: Request) {
  const wantsMeta = new URL(request.url).searchParams.get("meta") === "1";
  const hostedUrl = process.env.WINDOWS_DOWNLOAD_URL?.trim();

  if (hostedUrl) {
    if (wantsMeta) {
      return NextResponse.json({
        version: process.env.WINDOWS_DOWNLOAD_VERSION?.trim() || "latest",
        sizeBytes: null,
        source: "url",
      });
    }
    return NextResponse.redirect(hostedUrl, 302);
  }

  const installer = await findInstaller();

  if (!installer) {
    const message =
      "Windows installer is not available. Set WINDOWS_DOWNLOAD_URL to a hosted release asset, " +
      "or build the desktop app so an .exe exists under WINDOWS_SETUP_PATH " +
      `(default: ${DEFAULT_RELEASE_DIR}).`;
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (wantsMeta) {
    return NextResponse.json({
      version: installer.version,
      sizeBytes: installer.size,
      fileName: installer.fileName,
      source: "local",
    });
  }

  const headers = new Headers({
    "Content-Type": "application/vnd.microsoft.portable-executable",
    "Content-Disposition": `attachment; filename="${installer.fileName.replace(/"/g, "")}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });

  // Resume support matters for a ~320MB download over a flaky connection.
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;

  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : installer.size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= installer.size) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${installer.size}` },
      });
    }

    const clampedEnd = Math.min(end, installer.size - 1);
    headers.set("Content-Range", `bytes ${start}-${clampedEnd}/${installer.size}`);
    headers.set("Content-Length", String(clampedEnd - start + 1));

    const stream = Readable.toWeb(
      createReadStream(installer.filePath, { start, end: clampedEnd })
    ) as ReadableStream;
    return new NextResponse(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(installer.size));
  const stream = Readable.toWeb(createReadStream(installer.filePath)) as ReadableStream;
  return new NextResponse(stream, { status: 200, headers });
}
