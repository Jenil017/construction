import { z } from "zod";

/**
 * Validation primitives shared by the API and the web app.
 *
 * These live in `packages/shared` for one reason: the frontend and the backend
 * must agree. When each side rolls its own rule, the web accepts what the API
 * rejects (a confusing 500 the user can't act on) or the web blocks what the API
 * allows (a rule anyone bypasses with curl). Import from here on both sides.
 *
 * Two rules when extending this file:
 *  - Keep the `max` in step with the DB column. A zod max longer than the
 *    `varchar(N)` behind it turns a clean 400 into a Postgres 500.
 *  - Money and quantity go through `moneySchema` / `quantitySchema`, never a
 *    bare `z.number()`. See the note on `Infinity` below.
 */

// ─── Text ────────────────────────────────────────────────────────────────────

/**
 * A required, human-entered name. Trims first so "   " is rejected rather than
 * stored — `z.string().min(1)` alone happily accepts whitespace.
 */
export function nameSchema(max: number) {
  return z.string().trim().min(1, "This field is required.").max(max);
}

/** Optional free text, trimmed, capped to the DB column width. */
export function optionalText(max: number) {
  return z.string().trim().max(max).optional();
}

/**
 * Search / filter text. Capped because these reach an `ILIKE` — an unbounded
 * string is a CPU-burn vector on a Worker, and no real search term is this long.
 */
export const searchSchema = z.string().trim().max(100).optional();

// ─── Contact ─────────────────────────────────────────────────────────────────

/** Indian mobile: exactly 10 digits, first digit 6-9 (TRAI allocation). */
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * Accepts what people actually type — "+91 98250 12345", "098250-12345" — and
 * normalizes to the bare 10 digits, so the stored value is always comparable.
 * Rejecting on formatting alone would be user-hostile; storing the variants
 * would make "same number?" unanswerable.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/[\s\-()]/g, "").replace(/^(?:\+?91|0)/, ""))
  .refine((digits) => INDIAN_MOBILE_RE.test(digits), {
    message: "Enter a valid 10-digit mobile number.",
  });

/** Same, but an empty string is treated as "not provided" rather than invalid. */
export const optionalPhoneSchema = z
  .union([z.literal(""), phoneSchema])
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(255);

export const optionalEmailSchema = z
  .union([z.literal(""), emailSchema])
  .transform((v) => (v === "" ? undefined : v))
  .optional();

// ─── Numbers ─────────────────────────────────────────────────────────────────

/**
 * Upper bounds exist to keep a bad value a 400 instead of a 500: the money
 * columns are `numeric(14,2)` and quantities `numeric(14,3)`, so a larger number
 * fails at the database with a stack trace rather than at the edge with a
 * message. These ceilings sit an order of magnitude below the column limits and
 * far above any real construction figure.
 */
export const MAX_MONEY = 1_000_000_000; // ₹100 crore
export const MAX_QUANTITY = 10_000_000;

/**
 * `.finite()` is the important part, not the range.
 *
 * `z.number().positive()` accepts `Infinity`, JSON.parse turns `1e400` into
 * `Infinity`, and `String(Infinity)` is `"Infinity"` — which Postgres *accepts*
 * for a `numeric` column. That value then poisons every later `Number()` sum on
 * that row and cannot be arithmetically undone. Always use these helpers.
 */
export function moneySchema(opts: { allowZero?: boolean; max?: number } = {}) {
  const { allowZero = true, max = MAX_MONEY } = opts;
  const base = z.number().finite("Enter a valid amount.");
  return (
    allowZero ? base.nonnegative("Cannot be negative.") : base.positive("Must be more than 0.")
  ).max(max, "This amount is too large.");
}

export function quantitySchema(opts: { allowZero?: boolean; max?: number } = {}) {
  const { allowZero = false, max = MAX_QUANTITY } = opts;
  const base = z.number().finite("Enter a valid quantity.");
  return (
    allowZero ? base.nonnegative("Cannot be negative.") : base.positive("Must be more than 0.")
  ).max(max, "This quantity is too large.");
}

/** A whole-number count (days, pieces). Rejects 2.5 as well as -1. */
export function countSchema(max: number) {
  return z.number().int("Must be a whole number.").nonnegative("Cannot be negative.").max(max);
}

/** A 0-100 percentage. */
export const percentSchema = z
  .number()
  .finite()
  .min(0, "Cannot be negative.")
  .max(100, "Cannot be more than 100%.");

// ─── Dates ───────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today in the local timezone as `YYYY-MM-DD` (not UTC — site staff enter local dates). */
export function today(): string {
  const now = new Date();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/**
 * A real calendar date, not just the right shape. The old repo-wide regex
 * accepted "2026-13-45", which then reached Postgres and threw a 500 — the
 * round-trip check below is what rejects it as a 400 instead.
 */
export const dateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE_RE, "Use the date format YYYY-MM-DD.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return false;
    // Round-trip: Date rolls "2026-02-31" forward to March, so a value that
    // doesn't serialize back to itself was never a real date.
    return parsed.toISOString().slice(0, 10) === value;
  }, "Enter a real date.");

/** A date that cannot be in the future — attendance, DPR, expenses, payments. */
export const pastOrTodaySchema = dateSchema.refine((value) => value <= today(), {
  message: "This date cannot be in the future.",
});

/**
 * The same rule for a form field a user can clear.
 *
 * A cleared `<input type="date">` submits `""`. Validating that as a date gives
 * "Use the date format YYYY-MM-DD", which is misleading — the field is empty,
 * not misformatted — and the API treats these dates as optional anyway
 * (omitted → today). So blank resolves to today rather than erroring, and the
 * two layers agree.
 */
export const pastOrTodayOrBlankSchema = z
  .union([z.literal(""), pastOrTodaySchema])
  .transform((v) => (v === "" ? today() : v));

/** Accounting month, `YYYY-MM`, with the month range actually checked. */
export const monthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "Use the format YYYY-MM.")
  .refine((v) => {
    const month = Number(v.slice(5, 7));
    return month >= 1 && month <= 12;
  }, "Enter a real month.");

// ─── India-specific ──────────────────────────────────────────────────────────

/**
 * GSTIN: 2-digit state code, 10-char PAN, entity number, literal 'Z', checksum.
 * The previous `[0-9A-Z]{15}` accepted "ZZZZZZZZZZZZZZZ" — right length, not a
 * GSTIN. Structure is checked here; the checksum digit is not verified.
 */
const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(15, "A GSTIN is 15 characters.")
  .regex(GSTIN_RE, "Enter a valid GSTIN.");

export const optionalGstinSchema = z
  .union([z.literal(""), gstinSchema])
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** Valid GST state/UT codes: 01-38, plus 97 (other territory) and 99 (centre). */
export const stateCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}$/, "Enter a 2-digit state code.")
  .refine((v) => {
    const n = Number(v);
    return (n >= 1 && n <= 38) || n === 97 || n === 99;
  }, "Enter a valid GST state code.");

export const optionalStateCodeSchema = z
  .union([z.literal(""), stateCodeSchema])
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** HSN (goods) is 4, 6 or 8 digits; SAC (services) is 6. Digits only. */
export const hsnSchema = z
  .string()
  .trim()
  .regex(/^\d{4}(\d{2})?(\d{2})?$/, "HSN/SAC must be 4, 6 or 8 digits.");

export const optionalHsnSchema = z
  .union([z.literal(""), hsnSchema])
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** PAN: 5 letters, 4 digits, 1 letter. */
export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN.");

/** Indian pincode: 6 digits, cannot start with 0. */
export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode.");

/** IFSC: 4 letters, '0', then 6 alphanumerics. */
export const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code.");

// ─── Shared vocabularies ─────────────────────────────────────────────────────

/**
 * A closed set, so reports can group on it. Free-text payment modes fragment
 * into "Cash" / "cash" / "CASH" and quietly split every total that groups by it.
 *
 * The casing matches what is already stored in `invoices`, `site_sales`,
 * `purchases`, and `salary_payments` — changing it would reject an edit to every
 * existing record, so the vocabulary is pinned to the live data rather than to
 * a tidier convention. Match case-insensitively on input; store the canonical form.
 */
export const PAYMENT_MODES = ["Cash", "Bank transfer", "UPI", "Cheque", "Card", "Other"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Case-insensitive on the way in, canonical on the way out. */
export const paymentModeSchema = z
  .string()
  .trim()
  .transform((raw) => PAYMENT_MODES.find((m) => m.toLowerCase() === raw.toLowerCase()) ?? raw)
  .refine((v): v is PaymentMode => (PAYMENT_MODES as readonly string[]).includes(v), {
    message: `Choose one of: ${PAYMENT_MODES.join(", ")}.`,
  });

export const optionalPaymentModeSchema = z
  .union([z.literal(""), paymentModeSchema])
  .transform((v) => (v === "" ? undefined : v))
  .optional();
