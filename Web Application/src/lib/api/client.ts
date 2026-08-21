export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Condense a non-JSON error body (in practice a Next.js HTML error page) into
 * something short enough to sit in an inline error message.
 */
function bodySnippet(raw: string): string {
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return `: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch (networkErr) {
    // fetch() itself failed — connection refused, DNS error, timeout, etc.
    // Surface the real cause instead of letting it bubble as a raw TypeError
    // (which the UI catch block would show as "Failed to create project").
    const detail =
      networkErr instanceof Error ? networkErr.message : String(networkErr);
    throw new ApiError(
      `Network error: ${detail}`,
      0, // no HTTP status — request never reached the server
      detail
    );
  }

  // Read the body as text first, then parse. An uncaught exception in a route
  // handler produces a bare 500 with an HTML body — `res.json()` would throw
  // there and leave us with a contentless "Request failed", which is exactly
  // what made the v1.0.0 skit-creation 500 impossible to diagnose remotely.
  // Keeping the raw text lets the status and server output reach the user.
  const raw = await res.text().catch(() => "");
  let data: unknown = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const body = data as { error?: string; details?: unknown };
    throw new ApiError(
      body.error ?? `Request failed (HTTP ${res.status})${bodySnippet(raw)}`,
      res.status,
      body.details
    );
  }

  return data as T;
}

