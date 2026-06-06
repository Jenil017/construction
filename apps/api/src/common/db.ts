import { type Database, createDb } from "@construction-erp/db";
import type { Context } from "hono";
import type { Env } from "../env";

/**
 * A Drizzle client OR an open transaction — service helpers accept this so they
 * can run standalone or be composed inside a caller's transaction.
 */
export type DbClient = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Lazily build one Drizzle client per request and cache it on the context.
 * Uses the Neon serverless Pool (WebSocket) so interactive transactions work.
 */
export function getDb(c: Context<Env>): Database {
  const cached = c.get("db") as Database | undefined;
  if (cached) return cached;
  const db = createDb(c.env.DATABASE_URL);
  c.set("db", db);
  return db;
}
