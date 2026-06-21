/**
 * Pure invoice helpers: money rounding, the intra/inter-state GST computation,
 * financial-year + invoice-number formatting, and amount-in-words. Kept free of
 * Hono/DB so they're unit-testable and reusable by create + update + the PDF.
 */

export type InvoiceType = "tax" | "bill";
export type SupplyType = "intra" | "inter";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export interface RawLine {
  description: string;
  hsnCode?: string | null;
  quantity: number;
  unit?: string | null;
  rate: number;
  discountAmount?: number | null;
  gstRate?: number | null;
  materialId?: string | null;
}

export interface ComputedLine {
  description: string;
  hsnCode: string | null;
  quantity: number;
  unit: string | null;
  rate: number;
  discountAmount: number;
  taxableValue: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  lineTotal: number;
  materialId: string | null;
}

export interface ComputedTotals {
  subTotal: number;
  discountTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  amountInWords: string;
}

export interface ComputedInvoice {
  lines: ComputedLine[];
  totals: ComputedTotals;
}

/**
 * Compute every line's taxable value + GST split and the invoice totals.
 * `bill` invoices carry no tax (gstRate forced to 0). For a `tax` invoice the GST
 * is split CGST+SGST when intra-state and put fully on IGST when inter-state.
 * The grand total is rounded to the nearest rupee and the delta recorded as
 * `roundOff` (per common Indian invoice practice).
 */
export function computeInvoice(
  rawLines: RawLine[],
  opts: { invoiceType: InvoiceType; supplyType: SupplyType },
): ComputedInvoice {
  const lines: ComputedLine[] = rawLines.map((l) => {
    const quantity = round3(l.quantity);
    const rate = round2(l.rate);
    const discountAmount = round2(Math.max(0, l.discountAmount ?? 0));
    const taxableValue = round2(Math.max(0, quantity * rate - discountAmount));
    const gstRate = opts.invoiceType === "bill" ? 0 : round2(Math.max(0, l.gstRate ?? 0));
    const taxAmount = round2((taxableValue * gstRate) / 100);

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    if (taxAmount > 0) {
      if (opts.supplyType === "inter") {
        igstAmount = taxAmount;
      } else {
        cgstAmount = round2(taxAmount / 2);
        // Put any rounding remainder on SGST so cgst + sgst === taxAmount exactly.
        sgstAmount = round2(taxAmount - cgstAmount);
      }
    }
    const lineTotal = round2(taxableValue + taxAmount);
    return {
      description: l.description.trim(),
      hsnCode: l.hsnCode?.trim() || null,
      quantity,
      unit: l.unit?.trim() || null,
      rate,
      discountAmount,
      taxableValue,
      gstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      taxAmount,
      lineTotal,
      materialId: l.materialId ?? null,
    };
  });

  const sum = (pick: (l: ComputedLine) => number) => round2(lines.reduce((s, l) => s + pick(l), 0));
  const subTotal = sum((l) => l.taxableValue);
  const discountTotal = sum((l) => l.discountAmount);
  const cgstTotal = sum((l) => l.cgstAmount);
  const sgstTotal = sum((l) => l.sgstAmount);
  const igstTotal = sum((l) => l.igstAmount);
  const taxTotal = round2(cgstTotal + sgstTotal + igstTotal);
  const grandRaw = round2(subTotal + taxTotal);
  const grandTotal = Math.round(grandRaw);
  const roundOff = round2(grandTotal - grandRaw);

  return {
    lines,
    totals: {
      subTotal,
      discountTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      taxTotal,
      roundOff,
      grandTotal,
      amountInWords: amountInWords(grandTotal),
    },
  };
}

/** Indian financial year (Apr–Mar) for a `YYYY-MM-DD` date, e.g. "2026-27". */
export function financialYear(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const startYear = (m ?? 1) >= 4 ? (y ?? 0) : (y ?? 0) - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** "2026-27" → "26-27" for the compact invoice number. */
function shortFy(fy: string): string {
  const [a = "", b = ""] = fy.split("-");
  return `${a.slice(2)}-${b}`;
}

/** A short uppercase token from the site code/name for the invoice-number prefix. */
export function invoiceNumberPrefix(site: { code?: string | null; name: string }): string {
  const base = (site.code || site.name || "INV").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return base.slice(0, 4) || "INV";
}

/**
 * Format an invoice number. Tax invoices and bills of supply are distinct series
 * (a `B` marker keeps the strings unique). Kept within 16 chars for a 4-char
 * prefix (the CGST Rule 46 limit for tax invoices).
 */
export function formatInvoiceNumber(
  prefix: string,
  fy: string,
  seq: number,
  type: InvoiceType,
): string {
  const n = String(seq).padStart(4, "0");
  const marker = type === "bill" ? "B" : "";
  return `${prefix}/${shortFy(fy)}/${marker}${n}`;
}

// ─── Amount in words (Indian numbering: lakh/crore) ─────────────────────────────
const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${ONES[o]}` : (TENS[t] ?? "");
}

function integerWords(num: number): string {
  if (num === 0) return "Zero";
  const parts: string[] = [];
  let n = num;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(" ").trim();
}

/** "Rupees Three Lakh Forty Two Thousand and Fifty Paise Only". */
export function amountInWords(amount: number): string {
  const rounded = round2(Math.abs(amount));
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);
  let words = `Rupees ${integerWords(rupees)}`;
  if (paise > 0) words += ` and ${twoDigitWords(paise)} Paise`;
  return `${words} Only`;
}
