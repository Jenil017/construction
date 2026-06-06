import type { Logger } from "./common/logger";

/**
 * Hono environment for the Worker.
 * `Bindings` = Cloudflare vars/secrets/bindings (per docs/architecter.md).
 * `Variables` = values attached to the request context by middleware.
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
  };
}
