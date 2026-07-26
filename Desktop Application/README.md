# Video Studio — Desktop Edition

Electron shell that wraps the existing Next.js web application as a native Windows desktop app.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron Main Process                      │
│  ┌───────────────┐  ┌───────────────────┐   │
│  │ Embedded      │  │ Next.js Server    │   │
│  │ PostgreSQL    │  │ (child process)   │   │
│  │ :5435         │  │ :3100             │   │
│  └───────┬───────┘  └────────┬──────────┘   │
│          │                   │              │
│          └───── DATABASE_URL ┘              │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ BrowserWindow                        │   │
│  │ loads http://127.0.0.1:3100          │   │
│  │ (the existing Next.js web UI)        │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

Electron is a **thin shell**. It doesn't modify or repackage the web app — it starts it as a child process and loads it in a browser window.

## Prerequisites

- **Node.js** 20+
- **Web Application** built: `cd "../Web Application" && npm install && npm run build`
- At least one AI API key (OpenAI or Google AI)

## Development

```bash
# 1. Make sure the web app is built first
cd "../Web Application"
npm install
npm run build
cd "../Desktop Application"

# 2. Install dependencies
npm install

# 3. Compile and run
npm run dev
```

**API keys are automatically loaded from `Web Application/.env.local`** — no settings prompt needed. Make sure all required keys are present in that file:
- `OPENAI_API_KEY` (script generation)
- `GOOGLE_AI_API_KEY` (TTS)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Compile TypeScript + copy HTML + launch Electron |
| `npm run build` | Compile TypeScript + copy static files |
| `npm run start` | Launch Electron (requires prior `npm run build`) |
| `npm run package` | Full pipeline: build web app → compile desktop → create installer |

## Project Structure

```
Desktop Application/
├── src/
│   ├── main.ts          # Electron main process — boot orchestration
│   ├── preload.ts       # IPC bridge for splash & settings windows
│   ├── config.ts        # API key persistence (userData/config.json)
│   ├── postgres.ts      # Embedded PostgreSQL lifecycle
│   ├── server.ts        # Next.js child process manager
│   ├── splash.html      # Startup splash screen
│   └── settings.html    # API key configuration page
├── scripts/
│   ├── copy-static.js   # Copies HTML to dist/ after tsc
│   └── package.mjs      # Full build + packaging pipeline
├── electron-builder.config.js
├── package.json
├── tsconfig.json
└── README.md
```

## Data Storage

All local data is stored under Electron's `userData` directory:

| Path | Contents |
|------|----------|
| `userData/config.json` | API keys and settings |
| `userData/pgdata/` | Embedded PostgreSQL data directory |
| `userData/storage/` | Uploaded media, audio, exports |

On Windows this is typically: `%APPDATA%/video-studio-desktop/`

## Web Application Integration

The desktop app automatically reads from `Web Application/.env.local` and sets these environment variables when spawning the Next.js server:

| Variable | Source | Purpose |
|----------|--------|---------|
| `DESKTOP_MODE` | Generated | Signal to skip Clerk auth |
| `NEXT_PUBLIC_DESKTOP_MODE` | Generated | Client-side desktop detection |
| `DATABASE_URL` | Generated | Local embedded Postgres |
| `APP_STORAGE_ROOT` | Generated | Local media storage path |
| `OPENAI_API_KEY` | `.env.local` | Script generation |
| `GOOGLE_AI_API_KEY` | `.env.local` | TTS |
| `GROQ_API_KEY` | `.env.local` (optional) | Alternative inference |
| `GOOGLE_TTS_MODEL` | `.env.local` (optional) | TTS model override |

### Required Web App Changes (5 small edits)

For full desktop mode support, the web app needs these env-gated changes:

1. **`src/middleware.ts`** — When `DESKTOP_MODE=true`, skip `clerkMiddleware`
2. **`src/lib/auth/user.ts`** — When `DESKTOP_MODE=true`, return a fixed local user
3. **`src/components/providers/app-providers.tsx`** — When `NEXT_PUBLIC_DESKTOP_MODE=true`, skip `<ClerkProvider>`
4. **`src/lib/storage/paths.ts`** — Read `STORAGE_ROOT` from `APP_STORAGE_ROOT` env var
5. **`next.config.ts`** — Add `output: "standalone"` (optional, improves packaging)

All changes should be gated behind the `DESKTOP_MODE` env var so the Vercel deployment is unaffected.

## Packaging

```bash
npm run package
```

This creates a Windows installer in `release/`. The installer bundles:
- Electron runtime
- Compiled desktop app
- Web Application build output (`.next/`, `node_modules/`, etc.)
- Embedded PostgreSQL Windows binaries
- Prisma query engine (Windows)

## License

Private — same as the parent project.
