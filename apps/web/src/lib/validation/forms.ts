import {
  emailSchema,
  gstinSchema,
  hsnSchema,
  moneySchema,
  phoneSchema,
  quantitySchema,
  stateCodeSchema,
} from "@construction-erp/shared";
import { z } from "zod";

/**
 * Form-side adapters over the shared validation primitives.
 *
 * The rules themselves live in `@construction-erp/shared` so the browser and the
 * API agree; these wrappers only bridge the gap between an HTML form and those
 * rules. Two things need bridging:
 *
 *  - **Every input value is a string.** A number field holds `""` until typed
 *    into, so numeric schemas need a string→number coercion that treats blank
 *    as "not provided" rather than as `NaN`.
 *  - **Optional means empty string, not `undefined`.** An untouched optional
 *    input submits `""`; that has to become `null` for the API, not a validation
 *    failure.
 */

/** Optional text field: `""` → `null`. */
export const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

/** Optional text with a length cap matching the DB column. */
export function optionalStringMax(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((v) => (v === "" ? null : v));
}

/** Required text field, trimmed so "   " fails rather than saving blank. */
export function requiredString(max: number, message = "This field is required.") {
  return z.string().trim().min(1, message).max(max, `Use at most ${max} characters.`);
}

/**
 * A required number typed into a text/number input. Rejects blank explicitly —
 * `Number("")` is `0`, which would silently save a zero the user never entered.
 */
export function requiredNumber(schema: z.ZodType<number, z.ZodTypeDef, number>) {
  return z
    .string()
    .trim()
    .min(1, "Enter a value.")
    .transform((v, ctx) => {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid number." });
        return z.NEVER;
      }
      return n;
    })
    .pipe(schema);
}

/** An optional number input: blank → `null`, otherwise validated. */
export function optionalNumber(schema: z.ZodType<number, z.ZodTypeDef, number>) {
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid number." });
        return z.NEVER;
      }
      return n;
    })
    .pipe(schema.nullable());
}

/** Money typed into a form field. */
export const formMoney = (opts?: { allowZero?: boolean }) => requiredNumber(moneySchema(opts));
export const formOptionalMoney = (opts?: { allowZero?: boolean }) =>
  optionalNumber(moneySchema(opts));

/** Quantity typed into a form field. */
export const formQuantity = (opts?: { allowZero?: boolean }) =>
  requiredNumber(quantitySchema(opts));
export const formOptionalQuantity = (opts?: { allowZero?: boolean }) =>
  optionalNumber(quantitySchema(opts));

/** Optional contact/ID fields: blank is allowed, anything present must be valid. */
export const formOptionalPhone = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(phoneSchema.nullable());

export const formOptionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(emailSchema.nullable());

export const formOptionalGstin = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(gstinSchema.nullable());

export const formOptionalStateCode = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(stateCodeSchema.nullable());

export const formOptionalHsn = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(hsnSchema.nullable());
