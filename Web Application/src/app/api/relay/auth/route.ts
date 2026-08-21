import { NextRequest, NextResponse } from "next/server";
import { verifyGoogleIdToken, issueRelayToken } from "@/lib/relay/token";

/**
 * Exchanges a Google ID token (from the desktop app's own sign-in flow)
 * for a long-lived relay token. Called once per sign-in by the Electron
 * main process — see Desktop Application/src/main.ts.
 */
export async function POST(req: NextRequest) {
  let body: { idToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const idToken = body.idToken?.trim();
  if (!idToken) {
    return NextResponse.json({ error: "idToken is required." }, { status: 400 });
  }

  const clientId = process.env.DESKTOP_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "Relay is not configured (missing DESKTOP_GOOGLE_CLIENT_ID)." },
      { status: 500 }
    );
  }

  const identity = await verifyGoogleIdToken(idToken, clientId);
  if (!identity) {
    return NextResponse.json({ error: "Google ID token is invalid or expired." }, { status: 401 });
  }

  const relayToken = issueRelayToken(identity.sub, identity.email);
  return NextResponse.json({ relayToken });
}
