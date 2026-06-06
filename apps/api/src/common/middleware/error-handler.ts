import { ERROR_CODES } from "@construction-erp/shared";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { AppError } from "../errors";
import { fail } from "../responses";

/** Global error handler — maps any thrown error to the standard error envelope. */
export function onError(err: Error, c: Context) {
  const logger = c.get("logger");

  if (err instanceof AppError) {
    logger?.warn({ code: err.code, status: err.status, err: err.message }, "handled app error");
    return fail(
      c,
      err.status as 400,
      err.code,
      err.expose ? err.message : "Something went wrong. Please try again.",
      err.details,
    );
  }

  if (err instanceof HTTPException) {
    logger?.warn({ status: err.status }, "http exception");
    return fail(c, err.status, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message);
  }

  // Unknown / unexpected error: log full detail, return a generic message.
  logger?.error({ err: err.message, stack: err.stack }, "unhandled error");
  return fail(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, "Something went wrong. Please try again.");
}

/** 404 handler for unmatched routes. */
export function notFound(c: Context) {
  return fail(c, 404, ERROR_CODES.NOT_FOUND, "The requested resource was not found.");
}
