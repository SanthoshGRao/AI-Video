import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Supabase pooler can hang on DDL; prefer direct connection when set.
    url: process.env.DIRECT_URL?.trim() || env("DATABASE_URL"),
  },
});
