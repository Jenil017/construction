import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib";
import { fit, toAscii, wrapText } from "../reports/reports.render";

/** Shape the PDF needs — matches the serialized invoice (see invoices.routes.ts). */
export interface InvoicePdfData {
  invoiceType: "tax" | "bill";
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  supplyType: "intra" | "inter";
  placeOfSupply: string | null;
  reverseCharge: boolean;
  sellerName: string;
  sellerGstin: string | null;
  sellerAddress: string | null;
  sellerState: string | null;
  sellerStateCode: string | null;
  buyerName: string;
  buyerGstin: string | null;
  buyerAddress: string | null;
  buyerState: string | null;
  buyerStateCode: string | null;
  buyerContact: string | null;
  subTotal: number;
  discountTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  amountInWords: string | null;
  notes: string | null;
  status: "issued" | "cancelled";
  items: {
    description: string;
    hsnCode: string | null;
    quantity: number;
    unit: string | null;
    rate: number;
    taxableValue: number;
    gstRate: number;
    taxAmount: number;
    lineTotal: number;
  }[];
}

const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait
const MARGIN = 40;
const CONTENT_W = PAGE.width - MARGIN * 2;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.48);
const LINE = rgb(0.8, 0.82, 0.86);
const HEADER_BG = rgb(0.93, 0.94, 0.96);

/**
 * Indian-grouped rupees, e.g. "Rs 3,42,050.00". The "Rs" prefix (WinAnsi-safe in
 * place of ₹) is included by default; pass `prefix = false` for the line-item table
 * cells, where the column is narrow and the currency is implied by the totals.
 */
function inr(n: number, prefix = true): string {
  const neg = n < 0;
  const [intPart = "0", dec = "00"] = Math.abs(n).toFixed(2).split(".");
  const last3 = intPart.length > 3 ? intPart.slice(-3) : intPart;
  const other = intPart.length > 3 ? intPart.slice(0, -3) : "";
  const grouped = other ? `${other.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${neg ? "-" : ""}${prefix ? "Rs " : ""}${grouped}.${dec}`;
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

interface Col {
  key: string;
  label: string;
  weight: number;
  align: "left" | "right";
}

export async function renderInvoicePdf(inv: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(toAscii(s), {
      x,
      y: yy,
      size: opts.size ?? 9,
      font: opts.font ?? font,
      color: opts.color ?? INK,
    });
  };

  const rightText = (s: string, rightX: number, yy: number, size = 9, f: PDFFont = font) => {
    const t = toAscii(s);
    page.drawText(t, {
      x: rightX - f.widthOfTextAtSize(t, size),
      y: yy,
      size,
      font: f,
      color: INK,
    });
  };

  // ── Title ───────────────────────────────────────────────────────────────────
  const title = inv.invoiceType === "tax" ? "TAX INVOICE" : "BILL OF SUPPLY";
  const titleSize = 15;
  text(title, MARGIN + (CONTENT_W - bold.widthOfTextAtSize(title, titleSize)) / 2, y - 12, {
    size: titleSize,
    font: bold,
  });
  if (inv.status === "cancelled") {
    const c = "CANCELLED";
    text(c, MARGIN + (CONTENT_W - bold.widthOfTextAtSize(c, 10)) / 2, y - 26, {
      size: 10,
      font: bold,
      color: rgb(0.7, 0.1, 0.1),
    });
  }
  y -= 36;

  // ── Seller + invoice meta (two columns) ───────────────────────────────────────
  const colGap = 16;
  const leftW = CONTENT_W * 0.58;
  const rightX = MARGIN + leftW + colGap;
  let ly = y;
  text(inv.sellerName, MARGIN, ly - 10, { size: 11, font: bold });
  ly -= 24;
  for (const line of inv.sellerAddress ? wrapText(inv.sellerAddress, font, 9, leftW) : []) {
    text(line, MARGIN, ly, { size: 9, color: MUTED });
    ly -= 12;
  }
  if (inv.sellerState) {
    text(
      `State: ${inv.sellerState}${inv.sellerStateCode ? ` (${inv.sellerStateCode})` : ""}`,
      MARGIN,
      ly,
      { size: 9, color: MUTED },
    );
    ly -= 12;
  }
  if (inv.sellerGstin) {
    text(`GSTIN: ${inv.sellerGstin}`, MARGIN, ly, { size: 9, font: bold });
    ly -= 12;
  }

  // Right meta box.
  const meta: [string, string][] = [
    ["Invoice No", inv.invoiceNumber],
    ["Date", inv.invoiceDate],
  ];
  if (inv.dueDate) meta.push(["Due Date", inv.dueDate]);
  if (inv.invoiceType === "tax") {
    meta.push(["Supply", inv.supplyType === "inter" ? "Inter-state (IGST)" : "Intra-state"]);
    if (inv.placeOfSupply) meta.push(["Place of Supply", inv.placeOfSupply]);
    if (inv.reverseCharge) meta.push(["Reverse Charge", "Yes"]);
  }
  let ry = y;
  for (const [k, v] of meta) {
    text(`${k}:`, rightX, ry - 10, { size: 9, color: MUTED });
    rightText(v, MARGIN + CONTENT_W, ry - 10, 9, bold);
    ry -= 14;
  }
  y = Math.min(ly, ry) - 6;

  // ── Bill To ───────────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + CONTENT_W, y },
    thickness: 0.6,
    color: LINE,
  });
  y -= 14;
  text("Bill To", MARGIN, y, { size: 8, color: MUTED });
  y -= 13;
  text(inv.buyerName, MARGIN, y, { size: 10, font: bold });
  y -= 13;
  for (const line of inv.buyerAddress ? wrapText(inv.buyerAddress, font, 9, CONTENT_W * 0.7) : []) {
    text(line, MARGIN, y, { size: 9, color: MUTED });
    y -= 12;
  }
  const buyerBits: string[] = [];
  if (inv.buyerState)
    buyerBits.push(
      `State: ${inv.buyerState}${inv.buyerStateCode ? ` (${inv.buyerStateCode})` : ""}`,
    );
  if (inv.buyerContact) buyerBits.push(`Contact: ${inv.buyerContact}`);
  if (buyerBits.length) {
    text(buyerBits.join("   "), MARGIN, y, { size: 9, color: MUTED });
    y -= 12;
  }
  if (inv.buyerGstin) {
    text(`GSTIN: ${inv.buyerGstin}`, MARGIN, y, { size: 9, font: bold });
    y -= 12;
  }
  y -= 6;

  // ── Items table ───────────────────────────────────────────────────────────────
  const isTax = inv.invoiceType === "tax";
  const cols: Col[] = isTax
    ? [
        { key: "sr", label: "#", weight: 0.5, align: "left" },
        { key: "desc", label: "Description", weight: 4, align: "left" },
        { key: "hsn", label: "HSN/SAC", weight: 1.3, align: "left" },
        { key: "qty", label: "Qty", weight: 1.2, align: "right" },
        { key: "rate", label: "Rate", weight: 1.5, align: "right" },
        { key: "taxable", label: "Taxable", weight: 1.8, align: "right" },
        { key: "gst", label: "GST%", weight: 1, align: "right" },
        { key: "tax", label: "Tax", weight: 1.6, align: "right" },
        { key: "amount", label: "Amount", weight: 1.9, align: "right" },
      ]
    : [
        { key: "sr", label: "#", weight: 0.5, align: "left" },
        { key: "desc", label: "Description", weight: 5, align: "left" },
        { key: "hsn", label: "HSN/SAC", weight: 1.5, align: "left" },
        { key: "qty", label: "Qty", weight: 1.4, align: "right" },
        { key: "rate", label: "Rate", weight: 1.8, align: "right" },
        { key: "amount", label: "Amount", weight: 2, align: "right" },
      ];
  const totalWeight = cols.reduce((s, c) => s + c.weight, 0);
  let acc = MARGIN;
  const layout = cols.map((col) => {
    const width = (CONTENT_W * col.weight) / totalWeight;
    const x = acc;
    acc += width;
    return { col, x, width };
  });
  const SIZE = 8.5;
  const PAD = 3;
  const ROW_H = 15;

  const drawTableHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - ROW_H + 3,
      width: CONTENT_W,
      height: ROW_H,
      color: HEADER_BG,
    });
    for (const { col, x, width } of layout) {
      const label = fit(col.label, bold, SIZE, width - PAD * 2);
      const tx =
        col.align === "right" ? x + width - PAD - bold.widthOfTextAtSize(label, SIZE) : x + PAD;
      text(label, tx, y - ROW_H + 7, { size: SIZE, font: bold });
    }
    y -= ROW_H;
  };

  const ensureRoom = (needed: number) => {
    if (y - needed < MARGIN + 40) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
      drawTableHeader();
    }
  };

  drawTableHeader();

  inv.items.forEach((it, i) => {
    const descLines = wrapText(it.description, font, SIZE, layout[1]!.width - PAD * 2);
    const rowH = Math.max(ROW_H, descLines.length * 11 + 5);
    ensureRoom(rowH);
    const cells: Record<string, string> = {
      sr: String(i + 1),
      hsn: it.hsnCode ?? "",
      qty: `${num(it.quantity)}${it.unit ? ` ${it.unit}` : ""}`,
      rate: inr(it.rate, false),
      taxable: inr(it.taxableValue, false),
      gst: it.gstRate ? `${num(it.gstRate)}%` : "-",
      tax: inr(it.taxAmount, false),
      amount: inr(it.lineTotal, false),
    };
    const baseY = y - 11;
    for (const { col, x, width } of layout) {
      if (col.key === "desc") {
        let dy = baseY;
        for (const dl of descLines) {
          text(dl, x + PAD, dy, { size: SIZE });
          dy -= 11;
        }
        continue;
      }
      const v = cells[col.key] ?? "";
      if (!v) continue;
      const t = fit(v, font, SIZE, width - PAD * 2);
      const tx =
        col.align === "right" ? x + width - PAD - font.widthOfTextAtSize(t, SIZE) : x + PAD;
      text(t, tx, baseY, { size: SIZE });
    }
    y -= rowH;
    page.drawLine({
      start: { x: MARGIN, y: y + 2 },
      end: { x: MARGIN + CONTENT_W, y: y + 2 },
      thickness: 0.4,
      color: LINE,
    });
  });

  // ── Totals box ────────────────────────────────────────────────────────────────
  const totals: [string, string, boolean][] = [["Sub Total", inr(inv.subTotal), false]];
  if (inv.discountTotal > 0) totals.push(["Discount", `- ${inr(inv.discountTotal)}`, false]);
  if (isTax) {
    if (inv.cgstTotal > 0) totals.push(["CGST", inr(inv.cgstTotal), false]);
    if (inv.sgstTotal > 0) totals.push(["SGST", inr(inv.sgstTotal), false]);
    if (inv.igstTotal > 0) totals.push(["IGST", inr(inv.igstTotal), false]);
  }
  if (inv.roundOff !== 0) totals.push(["Round Off", inr(inv.roundOff), false]);
  totals.push([isTax ? "Grand Total" : "Total", inr(inv.grandTotal), true]);

  ensureRoom(totals.length * 14 + 50);
  y -= 8;
  const boxX = MARGIN + CONTENT_W * 0.5;
  for (const [label, value, strong] of totals) {
    const f = strong ? bold : font;
    const sz = strong ? 10 : 9;
    if (strong) {
      page.drawLine({
        start: { x: boxX, y: y + 3 },
        end: { x: MARGIN + CONTENT_W, y: y + 3 },
        thickness: 0.6,
        color: LINE,
      });
    }
    text(label, boxX, y - 8, { size: sz, font: f });
    rightText(value, MARGIN + CONTENT_W, y - 8, sz, f);
    y -= strong ? 18 : 14;
  }

  // ── Amount in words ───────────────────────────────────────────────────────────
  if (inv.amountInWords) {
    y -= 4;
    for (const line of wrapText(`Amount in words: ${inv.amountInWords}`, font, 9, CONTENT_W)) {
      text(line, MARGIN, y, { size: 9, font: bold });
      y -= 12;
    }
  }

  // ── Notes + reverse-charge note ───────────────────────────────────────────────
  if (inv.notes) {
    y -= 6;
    text("Notes", MARGIN, y, { size: 8, color: MUTED });
    y -= 12;
    for (const line of wrapText(inv.notes, font, 9, CONTENT_W)) {
      text(line, MARGIN, y, { size: 9, color: MUTED });
      y -= 12;
    }
  }
  if (isTax && inv.reverseCharge) {
    y -= 4;
    text("Tax is payable on reverse charge basis.", MARGIN, y, { size: 8, color: MUTED });
    y -= 12;
  }

  // ── Signature ─────────────────────────────────────────────────────────────────
  const sigY = Math.max(y - 24, MARGIN + 30);
  rightText(`For ${toAscii(inv.sellerName)}`, MARGIN + CONTENT_W, sigY, 9, bold);
  rightText("Authorised Signatory", MARGIN + CONTENT_W, sigY - 36, 8, font);

  // Footer note on every page.
  for (const p of doc.getPages()) {
    p.drawText("This is a computer-generated invoice.", {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7,
      font,
      color: MUTED,
    });
  }

  return doc.save();
}
