import { NextRequest, NextResponse } from "next/server";
import { authorizeRelayRequest } from "@/lib/relay/authorize";

const OPENAI_BASE = "https://api.openai.com";

/**
 * Generic passthrough to OpenAI. The desktop app's OpenAI client is
 * configured with baseURL `${AI_RELAY_URL}/api/relay/openai/v1`, so
 * whatever sub-path the AI SDK calls (chat/completions, responses,
 * embeddings, ...) arrives here as `path` and is forwarded verbatim to
 * the same path under api.openai.com — nothing here is tied to a
 * specific OpenAI endpoint shape.
 *
 * Auth: caller sends the relay token as a normal Bearer token (the AI
 * SDK already does this with whatever `apiKey` it's configured with).
 * We swap it for the real OPENAI_API_KEY before forwarding upstream.
 */
async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const auth = authorizeRelayRequest(req);
  if (!auth.ok) return auth.response;

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) {
    return NextResponse.json(
      { error: "Relay is not configured (missing OPENAI_API_KEY)." },
      { status: 500 }
    );
  }

  const targetUrl = `${OPENAI_BASE}/${path.join("/")}${req.nextUrl.search}`;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers: {
      "Content-Type": req.headers.get("content-type") ?? "application/json",
      Authorization: `Bearer ${openaiKey}`,
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
