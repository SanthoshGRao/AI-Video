# Video Studio — AI Relay

Minimal Next.js service that lets the **Video Studio desktop app** call OpenAI
and Gemini without shipping API keys to end users. The desktop app signs in
with Google, exchanges the Google ID token for a signed *relay token*, and
sends that token on every AI request. This service verifies the token, applies
a per-user daily quota, then forwards the request upstream using the real
provider keys held only here.

It is intentionally standalone — none of the heavy Web Application deps
(Remotion, ffmpeg, Prisma, Clerk, the WASM compositor) so it builds small and
deploys cleanly to Vercel serverless.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/relay/auth` | Exchange a Google ID token for a relay token |
| `* /api/relay/openai/*` | Authenticated passthrough to `api.openai.com` |
| `* /api/relay/gemini/*` | Authenticated passthrough to `generativelanguage.googleapis.com` |
| `GET /` | Status page (shows which env vars are configured — booleans only) |

## Environment variables

See [`.env.example`](./.env.example). All four of `RELAY_JWT_SECRET`,
`DESKTOP_GOOGLE_CLIENT_ID`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` are required.

## Deploy (Vercel)

```bash
npm i -g vercel
vercel link          # create/link a project
vercel env add RELAY_JWT_SECRET production
vercel env add DESKTOP_GOOGLE_CLIENT_ID production
vercel env add OPENAI_API_KEY production
vercel env add GOOGLE_AI_API_KEY production
vercel deploy --prod
```

Then set `AI_RELAY_BASE_URL` in `Desktop Application/src/config.ts` to the
deployment URL and rebuild the desktop installer.

The source of truth for the relay logic is this repo; the identical files also
exist inside the Web Application (`src/lib/relay/*`, `src/app/api/relay/*`) for
dev-mode testing. Keep them in sync if you change the token format.
