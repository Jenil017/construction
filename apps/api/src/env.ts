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
    // Cloudflare R2 (S3 API) for file storage — see common/r2. Account id +
    // bucket are non-secret vars (wrangler.jsonc); keys are secrets (.dev.vars).
    R2_ACCOUNT_ID: string;
    R2_BUCKET: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
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
