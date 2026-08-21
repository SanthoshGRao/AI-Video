import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/test-editor(.*)",
  // Loaded only by the desktop app's hidden export-rendering BrowserWindow
  // (Desktop Application/src/editor/export/render-window.ts), which has no
  // Clerk session — see gpu-compositor export-pipeline notes.
  "/export-render-worker(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Installer download linked from the landing page — must work signed-out.
  "/api/download(.*)",
  "/api/projects",
  "/api/notifications",
  "/api/webhooks(.*)",
  "/api/storage(.*)",
  // Desktop app calls these with no Clerk session — they carry their own
  // auth (a Google ID token, then a signed HMAC relay token; see
  // src/lib/relay/token.ts + authorize.ts). Without this exemption,
  // Clerk's auth.protect() rejects every relay call before it's reached.
  "/api/relay(.*)",
]);

// Desktop app runs as a single local user with no Clerk instance configured —
// skip Clerk entirely rather than calling a middleware that requires its keys.
const middleware = process.env.DESKTOP_MODE
  ? () => NextResponse.next()
  : clerkMiddleware(
      async (auth, request) => {
        if (!isPublicRoute(request)) {
          await auth.protect();
        }
      },
      { clockSkewInMs: 1000 * 60 * 60 * 24 } // 24 hours to cover massive clock skew during dev
    );

export default middleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
