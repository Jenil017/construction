import { z } from "zod";
import type { ErrorCode } from "../errors/codes";

/**
 * The single response envelope used by every endpoint. See docs/backend_guideline.md.
 * Success: { success: true, data, meta }
 * Error:   { success: false, error: { code, message, details } }
 */

export interface ApiSuccess<TData, TMeta = Record<string, unknown>> {
  success: true;
  data: TData;
  meta?: TMeta;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<TData, TMeta = Record<string, unknown>> =
  | ApiSuccess<TData, TMeta>
  | ApiErrorBody;

/** Zod schema for the error envelope — reused in OpenAPI docs for every endpoint. */
export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

/** Wrap a data schema in the standard success envelope for OpenAPI definitions. */
export function apiSuccessSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
    meta: z.record(z.unknown()).optional(),
  });
}
