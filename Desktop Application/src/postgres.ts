/**
 * postgres.ts — Embedded PostgreSQL lifecycle.
 *
 * Uses the `embedded-postgres` npm package to download, initialise,
 * and manage a portable PostgreSQL instance under <userData>/pgdata.
 *
 * If the user supplies their own DATABASE_URL via the settings page,
 * this module is skipped entirely (see main.ts).
 */

import fs from "fs";
import path from "path";
import { app } from "electron";

// embedded-postgres ships its own type declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
let EmbeddedPostgres: any;
try {
  // embedded-postgres is a pure ESM package; Node's require(esm) support
  // returns the module namespace object, so the constructor is under
  // `.default` rather than being the required value itself.
  const mod = require("embedded-postgres");
  EmbeddedPostgres = mod?.default ?? mod;
} catch {
  // Will be handled at runtime — startEmbeddedPostgres() will throw a
  // clear error if the package is missing.
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PG_PORT = 5435;
const PG_USER = "videostudio";
const PG_PASSWORD = "videostudio_local";
const PG_DATABASE = "videostudio";

let instance: any = null;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Connection string for the embedded instance. */
export function embeddedConnectionString(): string {
  return `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DATABASE}`;
}

/** Data directory for the embedded Postgres cluster. */
export function pgDataDir(): string {
  return path.join(app.getPath("userData"), "pgdata");
}

/**
 * Start the embedded Postgres server.
 *
 * On first run this downloads the Postgres binaries (cached by
 * embedded-postgres in its own cache dir) and initialises the data
 * directory.  Subsequent starts are near-instant.
 */
export async function startEmbeddedPostgres(): Promise<string> {
  if (!EmbeddedPostgres) {
    throw new Error(
      "embedded-postgres is not installed. Run `npm install embedded-postgres` " +
        "or provide your own DATABASE_URL in settings."
    );
  }

  const dataDir = pgDataDir();
  // embedded-postgres's initialise() unconditionally runs initdb — it does
  // NOT skip re-initialising an existing cluster, so we have to check
  // ourselves. PG_VERSION is the marker file initdb writes on success.
  const alreadyInitialised = fs.existsSync(path.join(dataDir, "PG_VERSION"));

  instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: true,
    // Without this, initdb picks an encoding from the Windows system locale
    // (e.g. WIN1252), which can't store emoji/unicode content the app uses.
    initdbFlags: ["--encoding=UTF8"],
  });

  if (!alreadyInitialised) {
    await instance.initialise();
  }
  await instance.start();

  // Create the application database if it doesn't exist yet.
  try {
    await instance.createDatabase(PG_DATABASE);
  } catch {
    // Database already exists — safe to ignore.
  }

  return embeddedConnectionString();
}

/**
 * Gracefully stop the embedded Postgres server.
 * Safe to call even if Postgres was never started.
 */
export async function stopEmbeddedPostgres(): Promise<void> {
  if (!instance) return;
  const current = instance;
  instance = null;
  try {
    const res = current.stop();
    if (res && typeof res.catch === "function") {
      res.catch(() => {});
    }
  } catch {
    // Suppress non-fatal embedded-postgres cleanup error
  }
}
