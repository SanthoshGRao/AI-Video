/**
 * Signed relay tokens — what the desktop app sends on every AI relay call
 * instead of a real OpenAI/Google key.
 *
 * Minted once by POST /api/relay/auth after verifying a Google ID token
 * from the desktop app's sign-in flow, then cached client-side for weeks
 * so we don't need Google refresh-token plumbing. It's a plain HMAC-signed
 * payload (no library dependency) — {sub, email, exp}.iat, base64url-encoded,
 * signed with RELAY_JWT_SECRET.
 */

import crypto from "crypto";

export interface RelayTokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function secret(): string {
  const s = process.env.RELAY_JWT_SECRET;
  if (!s?.trim()) {
    throw new Error("RELAY_JWT_SECRET is not configured on this deployment.");
  }
  return s.trim();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function sign(data: string): string {
  return base64url(crypto.createHmac("sha256", secret()).update(data).digest());
}

export function issueRelayToken(sub: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: RelayTokenPayload = {
    sub,
    email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/** Returns the payload if the token is well-formed, signed correctly, and unexpired. */
export function verifyRelayToken(token: string): RelayTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: RelayTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(body).toString("utf-8"));
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

/**
 * Verifies a Google-issued ID token via Google's tokeninfo endpoint —
 * avoids pulling in google-auth-library just for this one check.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expectedAudience: string
): Promise<{ sub: string; email: string } | null> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) return null;

  const json = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    aud?: string;
  };

  if (!json.sub || !json.email) return null;
  if (json.aud !== expectedAudience) return null;
  if (json.email_verified === "false" || json.email_verified === false) return null;

  return { sub: json.sub, email: json.email };
}
