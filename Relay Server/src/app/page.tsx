/**
 * Tiny status page so the root URL isn't a 404. The real work is all under
 * /api/relay/*. Reports which env vars are configured (booleans only — never
 * the values) so a misconfigured deployment is obvious at a glance.
 */
export const dynamic = "force-dynamic";

export default function Home() {
  const configured = {
    RELAY_JWT_SECRET: !!process.env.RELAY_JWT_SECRET?.trim(),
    DESKTOP_GOOGLE_CLIENT_ID: !!process.env.DESKTOP_GOOGLE_CLIENT_ID?.trim(),
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY?.trim(),
    GOOGLE_AI_API_KEY:
      !!process.env.GOOGLE_AI_API_KEY?.trim() || !!process.env.GOOGLE_CLOUD_API_KEY?.trim(),
  };
  const allGood = Object.values(configured).every(Boolean);

  return (
    <main style={{ maxWidth: 620, margin: "80px auto", padding: "0 24px", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22 }}>Video Studio — AI Relay</h1>
      <p style={{ color: "#555" }}>
        This service proxies OpenAI &amp; Gemini requests for the Video Studio desktop app. There is
        no UI here — endpoints live under <code>/api/relay/*</code>.
      </p>
      <p style={{ fontWeight: 600, color: allGood ? "#137333" : "#b00020" }}>
        {allGood ? "✓ Relay is configured." : "✗ Relay is missing required configuration."}
      </p>
      <ul style={{ color: "#555" }}>
        {Object.entries(configured).map(([k, v]) => (
          <li key={k}>
            {v ? "✓" : "✗"} {k}
          </li>
        ))}
      </ul>
    </main>
  );
}
