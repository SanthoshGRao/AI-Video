export async function postProjectAction<T>(
  url: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : "{}",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { error?: string }).error ||
      (data as { details?: string }).details ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}
