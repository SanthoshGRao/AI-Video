import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** Pin Turbopack to this app folder (avoids parent lockfile / node_modules). */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
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
    proxyClientMaxBodySize: "250mb",
  },
  
  webpack: (config, { dev }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
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
