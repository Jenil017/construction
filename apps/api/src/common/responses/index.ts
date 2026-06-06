import type { ApiErrorBody, ApiSuccess, ErrorCode } from "@construction-erp/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Helpers that emit the standard response envelope. OpenAPI route handlers
 * (via @hono/zod-openapi) usually return `c.json(...)` inline so the response
 * type can be inferred from the route definition; these helpers are for plain
 * routes and the global error handler.
 */
export function ok<T>(
  c: Context,
  data: T,
  meta?: Record<string, unknown>,
  status: ContentfulStatusCode = 200,
) {
  const body: ApiSuccess<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return c.json(body, status);
}

export function fail(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  const body: ApiErrorBody = {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  };
  return c.json(body, status);
}
