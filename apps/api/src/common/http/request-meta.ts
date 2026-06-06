import type { Context } from "hono";
import type { Env } from "../../env";

/** Best-effort client IP from Cloudflare / proxy headers. */
export function getClientIp(c: Context<Env>): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export interface RequestMeta {
  ip: string;
  userAgent: string | null;
  requestId: string | null;
}

/** Common audit/session metadata pulled from the request. */
export function getRequestMeta(c: Context<Env>): RequestMeta {
  return {
    ip: getClientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
    requestId: c.get("requestId") ?? null,
  };
}
