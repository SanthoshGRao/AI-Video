/**
 * oauth.ts — Google sign-in via the system browser (loopback redirect,
 * RFC 8252 "OAuth for Native Apps" — the same pattern GitHub CLI / gcloud
 * CLI use for "opens your browser to sign in").
 *
 * No Clerk, no server-side session — the desktop app is a single-user-
 * per-launch local process, so the verified Google profile is simply
 * handed back to the caller (main.ts) to cache in config.json and pass to
 * the spawned Next.js server as env vars.
 */

import http from "http";
import crypto from "crypto";
import { shell } from "electron";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  /** Raw Google-signed ID token — forwarded to the API relay's /api/relay/auth to mint a relay token. */
  idToken: string;
}

const CALLBACK_PATH = "/oauth/callback";
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes to complete the browser flow

function base64url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function successHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Signed in</title>
<style>body{font-family:system-ui,sans-serif;background:#111113;color:#F5F5F4;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0}
.card{text-align:center}h1{color:#2E8F63;font-size:1.25rem}</style></head>
<body><div class="card"><h1>Signed in to Video Studio</h1>
<p>You can close this tab and return to the app.</p></div></body></html>`;
}

function errorHtml(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Sign-in failed</title>
<style>body{font-family:system-ui,sans-serif;background:#111113;color:#F5F5F4;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0}
.card{text-align:center;max-width:420px}h1{color:#e05555;font-size:1.25rem}</style></head>
<body><div class="card"><h1>Sign-in failed</h1><p>${message}</p>
<p>You can close this tab and try again in Video Studio.</p></div></body></html>`;
}

/**
 * Runs the full browser-redirect Google sign-in flow. Resolves with the
 * verified profile, or rejects if the user cancels/denies, the flow times
 * out, or the credentials are invalid.
 */
export async function signInWithGoogle(
  clientId: string,
  clientSecret: string
): Promise<GoogleProfile> {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );
  const state = base64url(crypto.randomBytes(16));

  return new Promise<GoogleProfile>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      server.close();
      reject(new Error("Timed out waiting for Google sign-in."));
    }, TIMEOUT_MS);

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end();
        return;
      }

      const finish = (html: string, statusCode = 200) => {
        res.writeHead(statusCode, { "Content-Type": "text/html" });
        res.end(html);
        clearTimeout(timeout);
        // Give the response a moment to flush before tearing the server down.
        setTimeout(() => server.close(), 250);
      };

      void (async () => {
        try {
          const returnedState = url.searchParams.get("state");
          const error = url.searchParams.get("error");
          if (error) {
            finish(errorHtml("Google sign-in was cancelled."));
            if (!settled) {
              settled = true;
              reject(new Error("Google sign-in was cancelled."));
            }
            return;
          }
          if (returnedState !== state) {
            finish(errorHtml("Invalid state — possible CSRF, please try again."));
            if (!settled) {
              settled = true;
              reject(new Error("OAuth state mismatch."));
            }
            return;
          }
          const code = url.searchParams.get("code");
          if (!code) {
            finish(errorHtml("No authorization code returned."));
            if (!settled) {
              settled = true;
              reject(new Error("No authorization code returned from Google."));
            }
            return;
          }

          const address = server.address();
          const port = typeof address === "object" && address ? address.port : 0;
          const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
          const client = new OAuth2Client({ clientId, clientSecret, redirectUri });

          const { tokens } = await client.getToken({ code, codeVerifier });
          if (!tokens.id_token) {
            throw new Error("Google did not return an ID token.");
          }

          const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: clientId,
          });
          const payload = ticket.getPayload();
          if (!payload?.sub || !payload.email) {
            throw new Error("Google ID token was missing required fields.");
          }

          finish(successHtml());
          if (!settled) {
            settled = true;
            resolve({
              sub: payload.sub,
              email: payload.email,
              name: payload.name ?? null,
              picture: payload.picture ?? null,
              idToken: tokens.id_token,
            });
          }
        } catch (err: any) {
          finish(errorHtml(err?.message || "Something went wrong."), 500);
          if (!settled) {
            settled = true;
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      })();
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
      const client = new OAuth2Client({ clientId, clientSecret, redirectUri });

      const authUrl = client.generateAuthUrl({
        access_type: "online",
        scope: ["openid", "email", "profile"],
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        state,
      });

      shell.openExternal(authUrl);
    });

    server.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
  });
}
