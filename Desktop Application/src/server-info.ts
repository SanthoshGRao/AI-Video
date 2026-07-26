/**
 * server-info.ts — the running Next.js server's base URL, set once by
 * main.ts right after the child process is confirmed up, read by anything
 * in the main process that needs to load a page from it (e.g. the hidden
 * export-render-worker window — see editor/export/render-window.ts).
 */

let baseUrl: string | null = null;

export function setServerBaseUrl(url: string): void {
  baseUrl = url;
}

export function getServerBaseUrl(): string {
  if (!baseUrl) {
    throw new Error("getServerBaseUrl() called before the Next.js server was marked ready");
  }
  return baseUrl;
}
