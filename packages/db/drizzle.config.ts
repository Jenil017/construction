import { defineConfig } from "drizzle-kit";

// Load packages/db/.env into process.env for the Drizzle CLI (Node built-in).
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file — rely on the ambient environment (e.g. CI).
}

/**
 * Drizzle Kit config. `generate` works offline (diffs schema vs ./drizzle).
 * `migrate` / `push` / `studio` need a live DATABASE_URL (Neon connection string).
 * camelCase fields in the schema map to snake_case columns via `casing`.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  verbose: true,
  strict: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
