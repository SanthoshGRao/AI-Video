import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const { version: appVersion } = createRequire(import.meta.url)("./package.json");

/** Pin Turbopack to this app folder (avoids parent lockfile / node_modules). */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  // Stamped into exported project bundles so an import can tell which version
  // produced the file it is reading.
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  // The desktop app's hidden export-render-worker window (and its own main
  // window) load this dev server via 127.0.0.1 rather than localhost —
  // without this, Next's dev-mode HMR websocket is blocked as cross-origin,
  // which was silently preventing export-render-worker's page from mounting.
  // Dev-only setting; production/packaged builds have no HMR to block.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  typescript: {
    ignoreBuildErrors: true,
  },
  // @ts-expect-error - eslint is valid but missing in some NextConfig type definitions
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    root: appRoot,
  },
  // Keep tracing inside the app when the repo folder has extra files above
  outputFileTracingRoot: appRoot,
  serverExternalPackages: [
    "ffmpeg-static",
    "@prisma/client",
    "prisma",
    "@remotion/renderer",
    "@remotion/bundler",
    "esbuild"
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
    // Project bundles carry every video and image in the project, so an import
    // upload is routinely far larger than any other request the app makes.
    // Note this only lifts the framework's own ceiling — a platform in front of
    // it (Vercel caps serverless request bodies at 4.5 MB) still applies, which
    // is why large-bundle import is a desktop / self-hosted capability.
    proxyClientMaxBodySize: "16gb",
  },
  
  webpack: (config, { dev }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".mjs": [".mjs", ".js"],
    };
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          path.join(appRoot, "..", "node_modules"),
          path.join(appRoot, "..", ".next"),
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
