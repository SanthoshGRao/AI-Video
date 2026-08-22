/**
 * check-schema-drift.js — Fail the build when the desktop DDL falls behind
 * the Prisma schema. Run via `npm run check-schema`.
 *
 * The desktop app doesn't ship the Prisma CLI: it creates the local database
 * by executing the hand-maintained DDL in src/server.ts (see pushSchema).
 * The Web Application's Prisma Client, meanwhile, is generated from
 * prisma/schema.prisma and SELECTs every scalar column it knows about.
 *
 * When a field is added to schema.prisma and not mirrored into that DDL, the
 * two disagree — and the failure is invisible on a dev machine, because the
 * dev database was created by `prisma db push` from the real schema. It only
 * shows up on a fresh install, as
 *
 *   The column `users.passwordHash` does not exist in the current database.
 *
 * which is what shipped in 1.1.6. This check compares the two directly so the
 * drift is caught at build time instead of on a user's machine.
 */

const fs = require("fs");
const path = require("path");

const SCHEMA = path.join(__dirname, "..", "..", "Web Application", "prisma", "schema.prisma");
const SERVER = path.join(__dirname, "..", "src", "server.ts");

/* ---------------------------- parse schema.prisma ---------------------- */

function parsePrisma(src) {
  const modelNames = new Set(
    [...src.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1])
  );

  const enums = {};
  for (const m of src.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    enums[m[1]] = m[2]
      .split("\n")
      .map((l) => l.replace(/\/\/.*/, "").trim())
      .filter(Boolean);
  }

  const tables = {};
  for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model, body] = m;
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    const table = mapped ? mapped[1] : model;
    const columns = [];
    const indexes = [];

    for (const raw of body.split("\n")) {
      const line = raw.replace(/\/\/.*/, "").trim();
      if (!line) continue;

      const multi = line.match(/^@@(unique|index)\(\[([^\]]*)\]/);
      if (multi) {
        const cols = multi[2].split(",").map((c) => c.trim()).filter(Boolean);
        indexes.push(`${table}_${cols.join("_")}_${multi[1] === "unique" ? "key" : "idx"}`);
        continue;
      }
      if (line.startsWith("@@")) continue;

      const field = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
      if (!field) continue;
      const [, name, type, , , attrs = ""] = field;
      if (modelNames.has(type)) continue; // relation, not a column
      columns.push(name);
      if (/@unique/.test(attrs)) indexes.push(`${table}_${name}_key`);
    }

    tables[table] = { model, columns, indexes };
  }

  return { tables, enums };
}

/* ------------------------------ parse the DDL -------------------------- */

function parseDdl(src) {
  const tables = {};
  for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)" \(([\s\S]*?)\n\);/g)) {
    const [, table, body] = m;
    tables[table] = body
      .split("\n")
      .map((l) => l.trim().replace(/,$/, "").match(/^"(\w+)"\s+.+$/))
      .filter(Boolean)
      .map((c) => c[1]);
  }

  const enums = {};
  for (const m of src.matchAll(/CREATE TYPE "(\w+)" AS ENUM \(([^)]*)\)/g)) {
    enums[m[1]] = m[2].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
  }

  const indexes = new Set(
    [...src.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "(\w+)"/g)].map((m) => m[1])
  );

  return { tables, enums, indexes };
}

/* --------------------------------- compare ----------------------------- */

const prisma = parsePrisma(fs.readFileSync(SCHEMA, "utf8"));
const ddl = parseDdl(fs.readFileSync(SERVER, "utf8"));
const problems = [];

for (const [table, def] of Object.entries(prisma.tables)) {
  if (!ddl.tables[table]) {
    problems.push(`missing table "${table}" (model ${def.model}) — add a CREATE TABLE to DDL_TABLES_SQL`);
    continue;
  }
  for (const column of def.columns) {
    if (!ddl.tables[table].includes(column)) {
      problems.push(`missing column "${table}"."${column}" — add it to the CREATE TABLE in DDL_TABLES_SQL`);
    }
  }
  for (const index of def.indexes) {
    if (!ddl.indexes.has(index)) {
      problems.push(`missing index "${index}" — add it to DDL_CONSTRAINTS_SQL`);
    }
  }
}

for (const [name, values] of Object.entries(prisma.enums)) {
  if (!ddl.enums[name]) {
    problems.push(`missing enum "${name}" (${values.join(", ")}) — add a CREATE TYPE to DDL_TABLES_SQL`);
    continue;
  }
  for (const value of values) {
    if (!ddl.enums[name].includes(value)) {
      problems.push(`missing enum value "${name}"."${value}" — add it to the CREATE TYPE in DDL_TABLES_SQL`);
    }
  }
}

if (problems.length > 0) {
  console.error("\nSchema drift: src/server.ts is behind prisma/schema.prisma.\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\n${problems.length} problem(s). A fresh install would create a database ` +
      "the Prisma Client can't query.\n"
  );
  process.exit(1);
}

console.log("Schema check: src/server.ts DDL matches prisma/schema.prisma.");
