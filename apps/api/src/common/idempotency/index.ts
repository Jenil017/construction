import { idempotencyKeys } from "@construction-erp/db/schema";
import { sha256Hex } from "@construction-erp/shared";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "../../env";
import { getDb } from "../db";
import { IdempotencyError } from "../errors";

const HEADER = "Idempotency-Key";

/**
 * Idempotency middleware for critical mutating operations (see docs/architecter.md
 * "Use idempotency keys for…"). Behaviour when the client sends an `Idempotency-Key`:
 *
 *  - **First request** → claim a row (`in_progress`), run the handler, then store the
 *    response (`completed`). If the handler throws, release the claim so a genuine
 *    retry can proceed.
 *  - **Replay, same payload** → return the stored response verbatim (with an
 *    `Idempotent-Replay: true` header) without re-running the operation.
 *  - **Replay, different payload or user** → `IDEMPOTENCY_CONFLICT` (409).
 *  - **Replay while still in progress** → `IDEMPOTENCY_CONFLICT` ("retry shortly").
 *
 * No key header → the middleware is a no-op (backward compatible). Must run AFTER
 * `requireAuth` + `requireSiteContext` (it scopes the key to the active site).
 */
export function idempotency() {
  return createMiddleware<Env>(async (c, next) => {
    const key = c.req.header(HEADER);
    const auth = c.get("auth");
    const siteId = auth?.siteId;
    // Idempotency is only defined for site-scoped requests carrying a key.
    if (!key || !siteId) {
      await next();
      return;
    }

    const db = getDb(c);
    const method = c.req.method;
    const url = new URL(c.req.url);
    const path = `${url.pathname}${url.search}`;
    // Clone the underlying request so reading the body doesn't consume the stream
    // the route's schema validator reads afterwards.
    const rawBody = await c.req.raw.clone().text();
    const requestHash = await sha256Hex(`${method} ${path}\n${rawBody}`);

    // Atomically claim the (site, key). A losing racer gets [] and falls through.
    const [claimed] = await db
      .insert(idempotencyKeys)
      .values({
        siteId,
        userId: auth.userId,
        idempotencyKey: key,
        method,
        path: path.slice(0, 300),
        requestHash,
        status: "in_progress",
      })
      .onConflictDoNothing({
        target: [idempotencyKeys.siteId, idempotencyKeys.idempotencyKey],
      })
      .returning({ id: idempotencyKeys.id });

    if (!claimed) {
      const [existing] = await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.siteId, siteId), eq(idempotencyKeys.idempotencyKey, key)))
        .limit(1);

      if (!existing || existing.userId !== auth.userId || existing.requestHash !== requestHash) {
        // Same key reused with a different payload/user — never silently replace.
        throw new IdempotencyError();
      }
      if (existing.status === "completed" && existing.statusCode != null) {
        c.header("Idempotent-Replay", "true");
        return c.json(
          existing.responseBody as Record<string, unknown>,
          existing.statusCode as ContentfulStatusCode,
        );
      }
      // The original request is still running.
      throw new IdempotencyError("This request is still being processed. Please retry shortly.");
    }

    // First request: run the handler, then persist its response (or release on error).
    try {
      await next();
    } catch (err) {
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, claimed.id));
      throw err;
    }

    let body: unknown = null;
    try {
      body = await c.res.clone().json();
    } catch {
      body = null;
    }
    await db
      .update(idempotencyKeys)
      .set({ status: "completed", statusCode: c.res.status, responseBody: body })
      .where(eq(idempotencyKeys.id, claimed.id));
  });
}
