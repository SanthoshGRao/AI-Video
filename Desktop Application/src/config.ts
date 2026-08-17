/**
 * config.ts — Persistent configuration for the desktop app.
 *
 * API keys are never bundled into the app — a packaged installer is
 * just a zip file anyone can inspect, so any secret placed here would
 * be extractable by every user. In dev, if Web Application/.env.local
 * is present, its values are used directly (convenient for local
 * testing). Packaged installs get keys from whichever mechanism is
 * wired up for shared/zero-setup access (see the API-relay work) or,
 * failing that, fall back to the Settings window.
 *
 * Builds the full environment variable set that the Next.js server
 * child process needs.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { app } from "electron";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AppConfig {
  /** OpenAI key — used for script generation (GPT-4o) */
  openaiApiKey?: string;
  /** Google AI key — used for TTS (Gemini) and optionally scripts */
  googleAiApiKey?: string;
  /** Groq key — optional, faster inference for some models */
  groqApiKey?: string;
  /** If set, use this Postgres connection string instead of embedded */
  databaseUrl?: string;
  /** Override the Next.js server port (default 3100) */
  port?: number;

  /** User's own Google Cloud OAuth 2.0 "Desktop app" client credentials */
  googleClientId?: string;
  googleClientSecret?: string;
  /** Cached identity from the last successful Google sign-in */
  googleSub?: string;
  googleEmail?: string;
  googleName?: string;
  googlePicture?: string;

  /**
   * AI relay token — minted by exchanging the Google ID token from
   * sign-in with the hosted relay's /api/relay/auth. Lets the app call
   * OpenAI/Gemini through the relay with no local API key. Re-minted
   * automatically when missing or expired (see main.ts).
   */
  relayToken?: string;
  relayTokenExpiresAt?: number;
}

/* ------------------------------------------------------------------ */
/*  Environment file loader                                            */
/* ------------------------------------------------------------------ */

function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};

  if (!fs.existsSync(filePath)) {
    // Expected in packaged builds — .env.local isn't bundled, and the
    // hardcoded defaults cover it. Only worth logging in dev.
    if (!app.isPackaged) {
      console.log(`[config] No .env.local override found at ${filePath} — using baked-in defaults`);
    }
    return env;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (!match) continue;

      let [, key, value] = match;
      key = key.trim();
      value = value.trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }
  } catch (err) {
    console.warn(`[config] Failed to read .env file: ${err}`);
  }

  return env;
}

/* ------------------------------------------------------------------ */
/*  Baked-in defaults                                                  */
/* ------------------------------------------------------------------ */

/**
 * Google "Desktop app" OAuth client credentials. Unlike an OpenAI/Gemini
 * API key, these are NOT billing-sensitive secrets — Google's own model
 * for installed-app OAuth clients (RFC 8252) assumes native apps can't
 * keep a client secret confidential, which is why gcloud, the GitHub CLI,
 * etc. all ship theirs in the binary too. Safe to keep baked in.
 *
 * AI provider keys (OpenAI, Google AI) are deliberately NOT here — those
 * grant direct billing access, so shipping one in a distributable
 * installer means every user can extract and drain it. They come from
 * Web Application/.env.local in dev, or from Settings / the API relay
 * in packaged builds.
 */
const OAUTH_CLIENT_DEFAULTS: AppConfig = {
  googleClientId:
    "858992570133-cmsit4q743jufpngdobbmbr06slp05vf.apps.googleusercontent.com",
};

/**
 * Credentials that get baked into a build but must never be committed.
 * `secrets.json` sits next to package.json, is gitignored, and is copied
 * into dist/ by scripts/copy-static.js at build time — see
 * secrets.example.json for the shape.
 *
 * This repository is public, which makes an in-source credential a
 * self-inflicted outage: GitHub's push protection rejects the commit, and
 * anything that slips through gets scraped and auto-revoked. That is how the
 * previous Gemini key died — the SHA-256 eviction list in readSavedConfig
 * below is the cleanup for it.
 *
 * A missing file is a supported state. The OAuth client id above is not
 * secret (RFC 8252 assumes installed apps cannot keep one, which is why
 * gcloud and the GitHub CLI ship theirs too), so only the client *secret*
 * and the AI keys live here; without them the app falls back to the AI relay
 * or to keys entered in Settings.
 */
function loadBakedSecrets(): AppConfig {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "secrets.json"), "utf-8");
    const parsed = JSON.parse(raw) as AppConfig;
    // Only ever honour credentials from here — never identity or DB config.
    const allowed = [
      "googleClientId",
      "googleClientSecret",
      "googleAiApiKey",
      "openaiApiKey",
      "groqApiKey",
    ] as const;
    const out: AppConfig = {};
    for (const field of allowed) {
      if (parsed[field]) out[field] = parsed[field];
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Base URL of the hosted AI relay (the standalone "Relay Server/" app
 * deployed to Vercel — mirrors Web Application/src/app/api/relay/*). Not a
 * secret — it's just where the app sends relay-authenticated requests.
 * Override with AI_RELAY_URL in Web Application/.env.local to point at a
 * different/dev relay for local testing.
 */
export const AI_RELAY_BASE_URL = "https://ai-video-relay.vercel.app";

function getWebAppDir(): string {
  if (!app.isPackaged) {
    // In development, the Web Application lives alongside Desktop Application
    return path.resolve(__dirname, "..", "..", "Web Application");
  }
  // In production, the web app is bundled as an extra resource
  return path.join(process.resourcesPath!, "webapp");
}

/**
 * Dev-only convenience: if Web Application/.env.local exists (it never
 * does in a packaged install — electron-builder doesn't bundle it),
 * let its values fill in AI provider keys for local testing. Packaged
 * installs get no AI keys from here — see the API relay / Settings flow.
 */
function loadDefaults(): AppConfig {
  const envFile = path.join(getWebAppDir(), ".env.local");
  const envVars = loadEnvFile(envFile);

  const overrides: AppConfig = {};
  if (envVars.OPENAI_API_KEY) overrides.openaiApiKey = envVars.OPENAI_API_KEY;
  if (envVars.GOOGLE_AI_API_KEY) overrides.googleAiApiKey = envVars.GOOGLE_AI_API_KEY;
  if (envVars.GROQ_API_KEY) overrides.groqApiKey = envVars.GROQ_API_KEY;
  if (envVars.GOOGLE_CLIENT_ID) overrides.googleClientId = envVars.GOOGLE_CLIENT_ID;
  if (envVars.GOOGLE_CLIENT_SECRET) overrides.googleClientSecret = envVars.GOOGLE_CLIENT_SECRET;

  return { ...OAUTH_CLIENT_DEFAULTS, ...loadBakedSecrets(), ...overrides };
}

const BAKED_IN_DEFAULTS = loadDefaults();

/** AI_RELAY_URL in Web Application/.env.local overrides the baked-in relay URL, for local testing. */
export function getRelayBaseUrl(): string {
  const envFile = path.join(getWebAppDir(), ".env.local");
  const envVars = loadEnvFile(envFile);
  return (envVars.AI_RELAY_URL?.trim() || AI_RELAY_BASE_URL).replace(/\/$/, "");
}

/* ------------------------------------------------------------------ */
/*  Paths                                                              */
/* ------------------------------------------------------------------ */

function configPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

export function storagePath(): string {
  return path.join(app.getPath("userData"), "storage");
}

/* ------------------------------------------------------------------ */
/*  Read / Write                                                       */
/* ------------------------------------------------------------------ */

/**
 * SHA-256 of AI keys that shipped as a baked-in default and have since been
 * revoked. An earlier build wrote its baked key into every user's
 * config.json, and because saved values win over defaults, those users stayed
 * pinned to a dead key long after it was replaced — the app looked broken and
 * no update could fix it. Matching keys are evicted on read so the current
 * baked default takes over.
 *
 * Stored as digests rather than literals: this repository is public, and a
 * key-shaped string in source is what secret scanners (rightly) reject.
 */
const REVOKED_KEY_HASHES = new Set([
  // Gemini key baked into builds up to 1.1.3
  "b01f86bcbbb96ce7374375ce1b2a6906b9a92c75936cf45e3609040c8fb5634d",
]);

function isRevoked(key: string | undefined): boolean {
  if (!key) return false;
  return REVOKED_KEY_HASHES.has(
    crypto.createHash("sha256").update(key).digest("hex")
  );
}

function readSavedConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as AppConfig;
    if (isRevoked(parsed.googleAiApiKey)) delete parsed.googleAiApiKey;
    if (isRevoked(parsed.openaiApiKey)) delete parsed.openaiApiKey;
    return parsed;
  } catch {
    return {};
  }
}

/** Baked-in defaults, overridden by anything the user has explicitly saved. */
export function loadConfig(): AppConfig {
  return { ...BAKED_IN_DEFAULTS, ...readSavedConfig() };
}

/**
 * Merges into whatever's already on disk rather than overwriting it —
 * callers (settings window, login window) each only know about their own
 * slice of the config, so a blind overwrite would silently drop
 * everything else the user had already saved (API keys, relay token,
 * custom DB URL, ...).
 */
export function saveConfig(config: AppConfig): void {
  const dir = path.dirname(configPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const merged = { ...readSavedConfig(), ...config };
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), "utf-8");
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/** At least one AI provider key is needed to do anything useful. */
export function hasRequiredKeys(config: AppConfig): boolean {
  return !!(config.openaiApiKey?.trim() || config.googleAiApiKey?.trim());
}

/** The user has entered their own Google Cloud OAuth client credentials. */
export function hasGoogleCredentials(config: AppConfig): boolean {
  return !!(config.googleClientId?.trim() && config.googleClientSecret?.trim());
}

/** A previously-completed Google sign-in is cached — no need to re-open the browser. */
export function hasSignedInProfile(config: AppConfig): boolean {
  return !!(config.googleSub?.trim() && config.googleEmail?.trim());
}

/** An unexpired relay token is cached — no need to re-mint one before starting the server. */
export function hasValidRelayToken(config: AppConfig): boolean {
  return !!(
    config.relayToken?.trim() &&
    config.relayTokenExpiresAt &&
    // 1-day safety margin so we refresh before the relay actually rejects it.
    config.relayTokenExpiresAt > Date.now() + 24 * 60 * 60 * 1000
  );
}

/**
 * Clear the cached identity (but keep the OAuth client credentials) — used
 * by "Sign out". The fields are set to `undefined` rather than omitted:
 * `saveConfig` merges onto whatever's already on disk via object spread, so
 * an omitted key would just leave the previously-saved value untouched.
 * `undefined` values are dropped by `JSON.stringify`, which is what
 * actually deletes them from config.json.
 */
export function clearSignedInProfile(config: AppConfig): AppConfig {
  return {
    ...config,
    googleSub: undefined,
    googleEmail: undefined,
    googleName: undefined,
    googlePicture: undefined,
    relayToken: undefined,
    relayTokenExpiresAt: undefined,
  };
}

/** Read the current config from disk and strip the cached Google identity. */
export function signOut(): void {
  saveConfig(clearSignedInProfile(loadConfig()));
}

/* ------------------------------------------------------------------ */
/*  Server environment builder                                         */
/* ------------------------------------------------------------------ */

/**
 * Build the env vars injected into the Next.js child process.
 * Sets DESKTOP_MODE so the web app can skip Clerk auth + use local storage.
 */
export function buildServerEnv(
  config: AppConfig,
  databaseUrl: string,
  port: number
): Record<string, string> {
  const env: Record<string, string> = {
    // Core
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,

    // Desktop mode flag — web app should gate Clerk/auth on this
    DESKTOP_MODE: "true",
    NEXT_PUBLIC_DESKTOP_MODE: "true",

    // Database
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,

    // Local storage — web app's paths.ts should respect this
    APP_STORAGE_ROOT: storagePath(),

    // Dummy Clerk keys to prevent import-time crashes in middleware
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_desktop_placeholder",
    CLERK_SECRET_KEY: "sk_test_desktop_placeholder",
  };

  // AI API keys — a user-supplied key always wins over the relay.
  if (config.openaiApiKey?.trim()) {
    env.OPENAI_API_KEY = config.openaiApiKey.trim();
  }
  if (config.googleAiApiKey?.trim()) {
    env.GOOGLE_AI_API_KEY = config.googleAiApiKey.trim();
  }
  if (config.groqApiKey?.trim()) {
    env.GROQ_API_KEY = config.groqApiKey.trim();
  }

  // No local keys, but signed in with a valid relay token — route AI
  // calls through the hosted relay instead (zero-setup path). Groq has
  // no relay route; it just stays unavailable in that case.
  if (
    (!config.openaiApiKey?.trim() || !config.googleAiApiKey?.trim()) &&
    hasValidRelayToken(config)
  ) {
    env.AI_RELAY_URL = getRelayBaseUrl();
    env.AI_RELAY_TOKEN = config.relayToken!.trim();
  }

  // Signed-in Google identity — read by the web app's desktop-mode
  // getAuthUserId()/getOrCreateDbUser() instead of a fixed local user.
  if (config.googleSub?.trim() && config.googleEmail?.trim()) {
    env.DESKTOP_GOOGLE_ID = config.googleSub.trim();
    env.DESKTOP_GOOGLE_EMAIL = config.googleEmail.trim();
    if (config.googleName?.trim()) env.DESKTOP_GOOGLE_NAME = config.googleName.trim();
    if (config.googlePicture?.trim()) env.DESKTOP_GOOGLE_PICTURE = config.googlePicture.trim();
  }

  return env;
}
