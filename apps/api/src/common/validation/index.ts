import {
  emailSchema,
  gstinSchema,
  hsnSchema,
  phoneSchema,
  stateCodeSchema,
} from "@construction-erp/shared";
import { z } from "zod";

/**
 * API-side adapters over the shared validation primitives.
 *
 * The shared module owns the *rules* (what a valid phone or GSTIN is) so the web
 * app enforces exactly the same ones. This file owns the *shape* the API needs:
 * almost every optional column here is `T | null | undefined`, because PATCH
 * bodies use `null` to mean "clear this field" and omission to mean "leave it".
 *
 * Each helper accepts `""` and maps it to `null` — HTML form inputs submit empty
 * strings, and treating that as "not provided" rather than "invalid" is what
 * keeps an untouched optional field from failing validation.
 */

/**
 * Optional + nullable wrapper: `"" → null`, validates anything else.
 * The explicit `z.ZodType<string | null>` output keeps inference simple for
 * callers — without it the union/transform chain leaks into every route's
 * `c.req.valid("json")` type.
 */
function nullableOf(schema: z.ZodType<string, z.ZodTypeDef, unknown>) {
  return z
    .union([z.literal(""), z.null(), schema])
    .transform((v): string | null => (v === "" || v == null ? null : v))
    .optional();
}

export const nullablePhone = nullableOf(phoneSchema);
export const nullableEmail = nullableOf(emailSchema);
export const nullableGstin = nullableOf(gstinSchema);
export const nullableStateCode = nullableOf(stateCodeSchema);
export const nullableHsn = nullableOf(hsnSchema);

/** Required free text, trimmed and capped to the DB column width. */
export function requiredText(max: number, message = "This field is required.") {
  return z.string().trim().min(1, message).max(max);
}

/** Optional free text: `"" → null`, trimmed, capped to the DB column width. */
export function nullableText(max: number) {
  return nullableOf(z.string().trim().max(max));
}
