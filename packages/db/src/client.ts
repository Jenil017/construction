import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * Creates a Drizzle client backed by the Neon serverless Pool (WebSocket driver).
 * The Pool driver is used instead of the HTTP driver because the ERP needs
 * interactive transactions (attendance->salary, inventory movements, etc.).
 *
 * In Cloudflare Workers the global WebSocket is used automatically. In a Node
 * context (migrations, scripts) call `configureNeonForNode()` first.
 */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDb>;

/** Wire up the `ws` package as the WebSocket constructor when running under Node. */
export async function configureNeonForNode(): Promise<void> {
  if (!neonConfig.webSocketConstructor) {
    const ws = await import("ws");
    neonConfig.webSocketConstructor = ws.default;
  }
}
