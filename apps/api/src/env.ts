import type { Database } from "@construction-erp/db";
import type { AuthContext } from "./common/auth/context";
import type { Logger } from "./common/logger";

/**
 * Hono environment for the Worker.
 * `Bindings` = Cloudflare vars/secrets/bindings (per docs/architecter.md).
 * `Variables` = values attached to the request context by middleware/helpers.
 */
export interface Env {
  Bindings: {
    ENVIRONMENT: string;
    FRONTEND_URL: string;
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    requestId: string;
    logger: Logger;
    // Set lazily by getDb(); present after the first DB access in a request.
    db: Database;
    // Set by requireAuth on protected routes.
    auth: AuthContext;
  };
}
