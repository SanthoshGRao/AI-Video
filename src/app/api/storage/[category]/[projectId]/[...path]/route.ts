import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { handleRouteError } from "@/lib/api/errors";
import {
  assertInsideStorage,
  filePath,
  StorageCategory,
  isVercelDeployment,
  type StorageCategoryType,
} from "@/lib/storage/paths";
import { mimeFromFileName } from "@/lib/storage/local";

const VALID_CATEGORIES = new Set<string>(Object.values(StorageCategory));

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
};

type RouteContext = {
  params: Promise<{ category: string; projectId: string; path: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { category, projectId, path: pathArray } = await context.params;
    const fileName = pathArray.join("/");

    if (!VALID_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // Authentication is bypassed for storage GET requests to allow headless Remotion renderers 
    // and cross-origin audio elements to fetch the media without needing Clerk cookies.
    // The unguessable CUID project ID and filename serve as the security mechanism.

    const decodedName = decodeURIComponent(fileName);
    if (decodedName.includes("..") || decodedName.includes("/") || decodedName.includes("\\")) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }

    const absolutePath = filePath(
      category as StorageCategoryType,
      projectId,
      decodedName
    );

    // On Vercel, local files are ephemeral. If the file doesn't exist locally,
    // look up the asset in the database and redirect to the Blob URL.
    if (!fs.existsSync(absolutePath)) {
      if (isVercelDeployment()) {
        const blobUrl = await lookupBlobUrl(category as StorageCategoryType, projectId, decodedName);
        if (blobUrl) {
          return NextResponse.redirect(blobUrl, {
            status: 302,
            headers: CORS_HEADERS,
          });
        }
      }

      return NextResponse.json({ 
        error: "File not found",
      }, { status: 404, headers: CORS_HEADERS });
    }

    assertInsideStorage(absolutePath);

    const stat = fs.statSync(absolutePath);
    const fileSize = stat.size;
    const mime = mimeFromFileName(decodedName);
    const range = _request.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
            "Accept-Ranges": "bytes",
            ...CORS_HEADERS,
          },
        });
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(absolutePath, { start, end });
      const { Readable } = require("stream");
      const webStream = Readable.toWeb(fileStream);

      return new NextResponse(webStream as any, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunksize),
          "Content-Type": mime,
          "Cache-Control": "private, max-age=3600",
          ...CORS_HEADERS,
        },
      });
    }

    const fileStream = fs.createReadStream(absolutePath);
    const { Readable } = require("stream");
    const webStream = Readable.toWeb(fileStream);

    // Exports are downloads, not inline media — an explicit attachment header
    // makes the browser save the file reliably instead of trying to play it.
    const disposition: Record<string, string> =
      category === StorageCategory.EXPORTS
        ? { "Content-Disposition": `attachment; filename="${decodedName.replace(/"/g, "")}"` }
        : {};

    return new NextResponse(webStream as any, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        ...disposition,
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Look up a Blob URL from the database for a file that doesn't exist locally.
 * This handles the case where assets were uploaded to Vercel Blob but the
 * client still has old `/api/storage/...` URLs cached or stored in the DB.
 */
async function lookupBlobUrl(
  category: StorageCategoryType,
  projectId: string,
  fileName: string
): Promise<string | null> {
  try {
    // Lazy import to avoid circular dependencies
    const prisma = (await import("@/lib/db/prisma")).default;
    const storageKey = `${category}/${projectId}/${fileName}`;

    if (category === "audio") {
      const asset = await prisma.audioAsset.findFirst({
        where: {
          projectId,
          OR: [
            { r2Key: storageKey },
            { r2Url: { startsWith: "https://" } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (asset?.r2Url?.startsWith("https://")) return asset.r2Url;
    }

    if (category === "media" || category === "thumbnails") {
      const asset = await prisma.mediaAsset.findFirst({
        where: {
          projectId,
          OR: [
            { r2Key: storageKey },
            ...(category === "thumbnails" ? [{ thumbnailR2Key: storageKey }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (category === "thumbnails" && asset?.thumbnailUrl?.startsWith("https://")) {
        return asset.thumbnailUrl;
      }
      if (asset?.r2Url?.startsWith("https://")) return asset.r2Url;
    }
  } catch (err) {
    console.warn("[Storage API] Blob URL lookup failed:", err);
  }

  return null;
}
