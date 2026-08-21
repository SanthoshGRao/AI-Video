import { NextRequest, NextResponse } from "next/server";
import { authorizeRelayRequest } from "@/lib/relay/authorize";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

/**
 * Generic passthrough to the Google Generative Language API (Gemini text,
 * TTS, and STT-alignment all go through this one route — see
 * src/lib/ai/gemini-relay.ts on the caller side). Whatever path the
 * caller hits under /api/relay/gemini/ is forwarded verbatim to the same
 * path under generativelanguage.googleapis.com, with the real API key
 * appended as Google expects (`?key=`).
 *
 * Auth: caller sends the relay token as a Bearer token; we verify it and
 * swap in the real GOOGLE_AI_API_KEY before forwarding upstream.
 */
async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const auth = authorizeRelayRequest(req);
  if (!auth.ok) return auth.response;

  const googleKey =
    process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GOOGLE_CLOUD_API_KEY?.trim();
  if (!googleKey) {
    return NextResponse.json(
      { error: "Relay is not configured (missing GOOGLE_AI_API_KEY)." },
      { status: 500 }
    );
  }

  const search = new URLSearchParams(req.nextUrl.search);
  search.set("key", googleKey);
  const targetUrl = `${GEMINI_BASE}/${path.join("/")}?${search.toString()}`;

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers: {
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path);
}
