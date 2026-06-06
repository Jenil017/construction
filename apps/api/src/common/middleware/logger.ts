import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";
import { createLogger } from "../logger";

// One base logger per isolate; per-request child loggers carry the request id.
const baseLogger = createLogger({ level: "info" });

/**
 * Attaches a request-scoped logger to the context and logs each request's
 * outcome (route, method, status, duration) — see docs/backend_guideline.md.
 */
export const loggerMiddleware = createMiddleware<Env>(async (c, next) => {
  const log = baseLogger.child({
    requestId: c.get("requestId"),
    env: c.env.ENVIRONMENT,
  });
  c.set("logger", log);

  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;

  log.info({
    route: c.req.routePath,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
  });
});
