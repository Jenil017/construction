import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";
import { RateLimitError } from "../errors";
import { getClientIp } from "../http/request-meta";

/**
 * Best-effort in-isolate rate limiter for sensitive auth endpoints (login,
 * refresh). NOTE: Workers run many isolates, so this is per-isolate only and is
 * NOT a hard limit — it trims obvious abuse. Phase 9 replaces it with a
 * KV/Durable-Object backed limiter shared across isolates (see docs/plan.md).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function rateLimit(options: { bucket: string; limit: number; windowMs: number }) {
  return createMiddleware<Env>(async (c, next) => {
    const key = `${options.bucket}:${getClientIp(c)}`;
    if (!allow(key, options.limit, options.windowMs)) {
      throw new RateLimitError();
    }
    await next();
  });
}
