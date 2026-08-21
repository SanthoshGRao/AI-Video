import { NextRequest, NextResponse } from "next/server";
import { verifyRelayToken } from "@/lib/relay/token";
import { tryConsume } from "@/lib/relay/rate-limit";

export type RelayAuthResult =
  | { ok: true; sub: string; email: string; remaining: number }
  | { ok: false; response: NextResponse };

/**
 * Shared guard for the AI relay proxy routes: checks the Bearer relay
 * token and the caller's daily quota.
 */
export function authorizeRelayRequest(req: NextRequest): RelayAuthResult {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing relay token." }, { status: 401 }),
    };
  }

  const payload = verifyRelayToken(token);
  if (!payload) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Relay token is invalid or expired. Sign in again." },
        { status: 401 }
      ),
    };
  }

  const { ok, remaining, limit } = tryConsume(payload.sub);
  if (!ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Daily AI usage limit reached (${limit} requests/day). Try again tomorrow.` },
        { status: 429 }
      ),
    };
  }

  return { ok: true, sub: payload.sub, email: payload.email, remaining };
}
