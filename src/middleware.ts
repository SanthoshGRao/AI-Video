import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/test-editor(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/projects",
  "/api/notifications",
  "/api/webhooks(.*)",
  "/api/storage(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
}, { clockSkewInMs: 1000 * 60 * 60 * 24 }); // 24 hours to cover massive clock skew during dev

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
