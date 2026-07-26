/**
 * protocols.ts — privileged custom protocols for the native editor window.
 *
 * `editor://` serves the built editor-renderer static assets (production
 * only — dev loads the Vite dev server directly for HMR).
 *
 * `media://` maps to arbitrary local filesystem paths (MediaAsset/AudioAsset
 * `localPath` rows) so the renderer can load video/image/audio directly —
 * no HTTP layer, no dependency on the Next.js server. Built on `net.fetch`
 * against a `file://` URL, which is what gives us Range-request support for
 * video seeking "for free" from Electron/Chromium's own file handling.
 *
 * registerEditorProtocolSchemes() MUST be called before `app.whenReady()`;
 * the handlers themselves are registered by registerEditorProtocolHandlers()
 * after the app is ready.
 */

import { protocol, net } from "electron";
import path from "path";
import { pathToFileURL } from "url";

export function registerEditorProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "editor",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
    {
      scheme: "media",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: true,
      },
    },
  ]);
}

/** Encode an absolute local filesystem path as a `media://asset/<encoded>` URL. */
export function toMediaUrl(absolutePath: string): string {
  return `media://asset/${encodeURIComponent(absolutePath)}`;
}

function decodeMediaUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

export function registerEditorProtocolHandlers(editorDistDir: string): void {
  protocol.handle("media", async (request) => {
    try {
      const absolutePath = decodeMediaUrl(request.url);
      const fileUrl = pathToFileURL(absolutePath).href;
      return net.fetch(fileUrl, { headers: request.headers });
    } catch (err) {
      return new Response(`media:// error: ${(err as Error).message}`, { status: 404 });
    }
  });

  protocol.handle("editor", async (request) => {
    const url = new URL(request.url);
    let relativePath = decodeURIComponent(url.pathname);
    if (!relativePath || relativePath === "/") relativePath = "/index.html";
    // SPA fallback: any path without a file extension resolves to index.html.
    if (!path.extname(relativePath)) relativePath = "/index.html";

    const filePath = path.join(editorDistDir, relativePath);
    const fileUrl = pathToFileURL(filePath).href;
    return net.fetch(fileUrl, { headers: request.headers });
  });
}
