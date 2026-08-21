/**
 * electron-builder configuration.
 *
 * Targets Windows NSIS installer.  Bundles:
 *   - Compiled Electron app (dist/)
 *   - Web Application build output (.next/, node_modules, etc.)
 *   - Prisma Windows query engine
 *   - embedded-postgres binaries (cached by the package)
 *   - ffmpeg-static Windows binary (resolved by npm)
 */

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.videostudio.desktop",
  productName: "Video Studio",
  copyright: "Copyright © 2025 Video Studio",

  // Written into resources/app-update.yml, which is where electron-updater
  // looks for releases. The repo was renamed Landing-Page -> AI-Video;
  // GitHub redirects the old name, but relying on that redirect for the
  // update channel is a needless dependency, so name it directly.
  publish: {
    provider: "github",
    owner: "SanthoshGRao",
    repo: "AI-Video",
  },

  directories: {
    output: "release",
    buildResources: "build",
  },

  files: [
    "dist/**/*",
    "node_modules/**/*",
    "package.json",
  ],

  // embedded-postgres's native .exe binaries must live as real files on
  // disk (they're spawned via child_process, and its ESM build resolves
  // its own path via `import.meta.url` for the .exe locations). asarUnpack
  // alone isn't enough — Electron's asar->unpacked path substitution only
  // reliably covers CJS __dirname/fs calls, not import.meta.url — so the
  // simplest robust fix is to skip asar packing for this app entirely.
  // There's no meaningful benefit to asar here (no code obfuscation need,
  // no perf-sensitive cold start), so it's not worth fighting.
  asar: false,

  extraResources: [
    {
      // Bundle the Web Application build output. This still includes the
      // full node_modules (in addition to .next/standalone's own pruned
      // copy) because `prisma db push`/`db seed` at first launch need the
      // prisma CLI + tsx, which Next's trace doesn't pick up (they're only
      // invoked via child_process, not `require`d by request-handling
      // code) — and their full transitive dependency closure (prisma CLI
      // alone pulls in @prisma/engines, @prisma/studio-core, mysql2, etc.)
      // isn't worth hand-curating. The real size problem here wasn't
      // node_modules — it was `storage/`, 4.5GB of real uploaded media
      // that Next's tracer swept in by mistake (see
      // scripts/copy-standalone-assets.js) and is stripped from
      // .next/standalone before this copy ever runs.
      from: "../Web Application",
      to: "webapp",
      filter: [
        ".next/**/*",
        "node_modules/**/*",
        "public/**/*",
        "prisma/**/*",
        "src/generated/**/*",
        "package.json",
        "next.config.ts",
      ],
    },
    {
      // Native editor UI (Desktop Application/editor-renderer) — a
      // separate Vite/React build, decoupled from the Web Application,
      // served in production via the editor:// custom protocol
      // (see src/editor/protocols.ts / window.ts).
      from: "editor-renderer/dist",
      to: "editor-renderer",
    },
    {
      // Full/GPL static ffmpeg build with NVENC/QSV/AMF encoders — NOT
      // the minimal ffmpeg-static package the web app uses. See
      // src/editor/export/ffmpeg-locate.ts and README for how to fetch
      // these binaries into this folder before packaging.
      from: "resources/ffmpeg",
      to: "ffmpeg",
    },
    {
      // Fallback font for ffmpeg's drawtext filter (text/shape clips) —
      // see src/editor/export/fonts.ts.
      from: "resources/fonts",
      to: "fonts",
    },
  ],

  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    icon: "build/icon.ico",
  },

  nsis: {
    artifactName: "Video-Studio-Setup-${version}.${ext}",
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    installerIcon: "build/icon.ico",
    uninstallerIcon: "build/icon.ico",
    installerHeaderIcon: "build/icon.ico",
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Video Studio",
  },
};
