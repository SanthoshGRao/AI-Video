import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The canonical timeline model (../src/editor/model) is shared, plain-TS,
// zero-Node-API code intentionally kept importable from both the Electron
// main process (tsc/CommonJS) and this Vite app (ESM) — see
// Desktop Application/src/editor/model/types.ts for why.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [".."],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
