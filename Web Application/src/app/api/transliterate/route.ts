import { NextResponse } from "next/server";

/**
 * Proxy for Google Input Tools transliteration ("namaskara" -> "ನಮಸ್ಕಾರ").
 *
 * The upstream endpoint returns no CORS headers, so the browser cannot call it
 * directly — it has to go through us. It is also an undocumented endpoint, so
 * every failure path here degrades to "no suggestions" rather than an error the
 * user sees: the editor stays usable as a plain Latin textarea if it goes away.
 */

/** Input-method codes per language. Latin script in, native script out. */
const ITC_BY_LANG: Record<string, string> = {
  kn: "kn-t-i0-und",
  hi: "hi-t-i0-und",
};

const MAX_WORD_LENGTH = 32;
const UPSTREAM_TIMEOUT_MS = 3000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = (searchParams.get("text") ?? "").trim();
  const lang = searchParams.get("lang") ?? "kn";

  const itc = ITC_BY_LANG[lang];
  // Only ASCII letters make sense as input; anything else is already native
  // script (or punctuation) and has no transliteration to look up.
  if (!itc || !text || text.length > MAX_WORD_LENGTH || !/^[a-zA-Z]+$/.test(text)) {
    return NextResponse.json({ candidates: [] });
  }

  const url =
    `https://inputtools.google.com/request?text=${encodeURIComponent(text)}` +
    `&itc=${itc}&num=5&cp=0&cs=1&ie=utf-8&oe=utf-8`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // Suggestions for a given word never change; let the CDN/browser hold them.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return NextResponse.json({ candidates: [] });

    // Shape: ["SUCCESS", [[ "namaskara", ["ನಮಸ್ಕಾರ", ...], [], {...} ]]]
    const data = await res.json();
    if (!Array.isArray(data) || data[0] !== "SUCCESS") {
      return NextResponse.json({ candidates: [] });
    }
    const candidates: unknown = data[1]?.[0]?.[1];
    const list = Array.isArray(candidates)
      ? candidates.filter((c): c is string => typeof c === "string")
      : [];

    return NextResponse.json(
      { candidates: list },
      { headers: { "Cache-Control": "public, max-age=86400, immutable" } }
    );
  } catch {
    // Timeout, network failure, or upstream shape change — fall back silently.
    return NextResponse.json({ candidates: [] });
  }
}
