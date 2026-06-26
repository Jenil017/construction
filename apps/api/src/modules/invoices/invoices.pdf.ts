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
const MARGIN = 36;
const CONTENT_W = PAGE.width - MARGIN * 2;
const RIGHT = MARGIN + CONTENT_W;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.48);
const LINE = rgb(0.72, 0.74, 0.8);
const HEADER_BG = rgb(0.9, 0.92, 0.95);
const ZEBRA = rgb(0.972, 0.978, 0.988);
const RED = rgb(0.7, 0.1, 0.1);

/**
 * Indian-grouped rupees, e.g. "Rs 3,42,050.00". The "Rs" prefix (WinAnsi-safe in
 * place of ₹) is included by default; pass `prefix = false` for table cells where the
 * column is narrow and the currency is implied.
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

const pct = (n: number) => `${num(n)}%`;

interface Col {
  key: string;
  label: string;
  weight: number;
  align: "left" | "right";
}

/** Resolve x/width for each column across CONTENT_W. */
function layoutCols(cols: Col[]) {
  const totalWeight = cols.reduce((s, c) => s + c.weight, 0);
  let acc = MARGIN;
  return cols.map((col) => {
    const width = (CONTENT_W * col.weight) / totalWeight;
    const x = acc;
    acc += width;
    return { col, x, width };
  });
}

export async function renderInvoicePdf(inv: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const isTax = inv.invoiceType === "tax";
  const isInter = inv.supplyType === "inter";

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  // ── Drawing primitives (close over the current `page`) ───────────────────────────
  const text = (
    s: string,
    x: number,
    yy: number,
    o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) =>
    page.drawText(toAscii(s), {
      x,
      y: yy,
      size: o.size ?? 9,
      font: o.font ?? font,
      color: o.color ?? INK,
    });
  const rtext = (s: string, rx: number, yy: number, size = 9, f: PDFFont = font, color = INK) => {
    const t = toAscii(s);
    page.drawText(t, { x: rx - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });
  };
  const cell = (
    s: string,
    x: number,
    width: number,
    yy: number,
    align: "left" | "right",
    o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; pad?: number } = {},
  ) => {
    const size = o.size ?? 8.5;
    const f = o.font ?? font;
    const pad = o.pad ?? 4;
    const t = fit(s, f, size, width - pad * 2);
    const tx = align === "right" ? x + width - pad - f.widthOfTextAtSize(t, size) : x + pad;
    page.drawText(t, { x: tx, y: yy, size, font: f, color: o.color ?? INK });
  };
  const box = (
    x: number,
    top: number,
    w: number,
    h: number,
    o: { fill?: ReturnType<typeof rgb>; border?: boolean; bw?: number } = {},
  ) =>
    page.drawRectangle({
      x,
      y: top - h,
      width: w,
      height: h,
      color: o.fill,
      borderColor: o.border === false ? undefined : LINE,
      borderWidth: o.border === false ? 0 : (o.bw ?? 0.7),
    });
  const hline = (x1: number, x2: number, yy: number, t = 0.6, c = LINE) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: t, color: c });
  const vlines = (xs: number[], top: number, bottom: number, t = 0.6, c = LINE) => {
    for (const x of xs)
      page.drawLine({ start: { x, y: top }, end: { x, y: bottom }, thickness: t, color: c });
  };

  // ── Title band ──────────────────────────────────────────────────────────────────
  const BAND_H = 30;
  box(MARGIN, y, CONTENT_W, BAND_H, { fill: HEADER_BG });
  text(isTax ? "TAX INVOICE" : "BILL OF SUPPLY", MARGIN + 10, y - 20, { size: 14, font: bold });
  if (inv.status === "cancelled") {
    rtext("CANCELLED", RIGHT - 10, y - 19, 11, bold, RED);
  } else {
    rtext("ORIGINAL FOR RECIPIENT", RIGHT - 10, y - 18, 7.5, font, MUTED);
  }
  y -= BAND_H;

  // ── Seller letterhead (left) + invoice details (right) ───────────────────────────
  const leftW = CONTENT_W * 0.56;
  const rightW = CONTENT_W - leftW;
  const rightX = MARGIN + leftW;

  const sellerAddr = inv.sellerAddress ? wrapText(inv.sellerAddress, font, 8.5, leftW - 16) : [];
  const meta: [string, string][] = [
    ["Invoice No", inv.invoiceNumber],
    ["Invoice Date", inv.invoiceDate],
  ];
  if (inv.dueDate) meta.push(["Due Date", inv.dueDate]);
  if (isTax) {
    meta.push(["Place of Supply", inv.placeOfSupply || inv.buyerState || "-"]);
    meta.push(["Supply Type", isInter ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"]);
    if (inv.reverseCharge) meta.push(["Reverse Charge", "Yes"]);
  }

  const sellerH =
    16 + sellerAddr.length * 11 + (inv.sellerState ? 11 : 0) + (inv.sellerGstin ? 13 : 0);
  const metaH = meta.length * 13;
  const headH = Math.max(sellerH, metaH, 56) + 14;

  box(MARGIN, y, leftW, headH);
  box(rightX, y, rightW, headH);

  let ly = y - 18;
  text(inv.sellerName, MARGIN + 8, ly, { size: 11.5, font: bold });
  ly -= 15;
  for (const l of sellerAddr) {
    text(l, MARGIN + 8, ly, { size: 8.5, color: MUTED });
    ly -= 11;
  }
  if (inv.sellerState) {
    text(
      `State: ${inv.sellerState}${inv.sellerStateCode ? ` (${inv.sellerStateCode})` : ""}`,
      MARGIN + 8,
      ly,
      { size: 8.5, color: MUTED },
    );
    ly -= 11;
  }
  if (inv.sellerGstin) {
    text(`GSTIN: ${inv.sellerGstin}`, MARGIN + 8, ly, { size: 9, font: bold });
  }

  let ry = y - 18;
  for (const [k, v] of meta) {
    text(k, rightX + 8, ry, { size: 8.5, color: MUTED });
    rtext(v, RIGHT - 8, ry, 8.5, bold);
    ry -= 13;
  }
  y -= headH;

  // ── Bill To ───────────────────────────────────────────────────────────────────────
  const buyerAddr = inv.buyerAddress ? wrapText(inv.buyerAddress, font, 8.5, CONTENT_W - 16) : [];
  const buyerBits: string[] = [];
  if (inv.buyerState)
    buyerBits.push(
      `State: ${inv.buyerState}${inv.buyerStateCode ? ` (${inv.buyerStateCode})` : ""}`,
    );
  if (inv.buyerContact) buyerBits.push(`Contact: ${inv.buyerContact}`);
  const billH =
    15 + 14 + buyerAddr.length * 11 + (buyerBits.length ? 11 : 0) + (inv.buyerGstin ? 13 : 0) + 6;

  box(MARGIN, y, CONTENT_W, billH);
  box(MARGIN, y, CONTENT_W, 15, { fill: HEADER_BG, border: false });
  text("BILL TO", MARGIN + 8, y - 10.5, { size: 7.5, font: bold, color: MUTED });
  let by = y - 27;
  text(inv.buyerName, MARGIN + 8, by, { size: 10, font: bold });
  by -= 13;
  for (const l of buyerAddr) {
    text(l, MARGIN + 8, by, { size: 8.5, color: MUTED });
    by -= 11;
  }
  if (buyerBits.length) {
    text(buyerBits.join("     "), MARGIN + 8, by, { size: 8.5, color: MUTED });
    by -= 11;
  }
  if (inv.buyerGstin) {
    text(`GSTIN: ${inv.buyerGstin}`, MARGIN + 8, by, { size: 9, font: bold });
  }
  y -= billH + 10;

  // ── Items table ───────────────────────────────────────────────────────────────────
  const cols: Col[] = isTax
    ? [
        { key: "sr", label: "#", weight: 0.5, align: "left" },
        { key: "desc", label: "Description", weight: 4.1, align: "left" },
        { key: "hsn", label: "HSN/SAC", weight: 1.3, align: "left" },
        { key: "qty", label: "Qty", weight: 1.3, align: "right" },
        { key: "rate", label: "Rate", weight: 1.5, align: "right" },
        { key: "taxable", label: "Taxable", weight: 1.7, align: "right" },
        { key: "gst", label: "GST%", weight: 0.9, align: "right" },
        { key: "tax", label: "Tax", weight: 1.5, align: "right" },
        { key: "amount", label: "Amount", weight: 1.8, align: "right" },
      ]
    : [
        { key: "sr", label: "#", weight: 0.5, align: "left" },
        { key: "desc", label: "Description", weight: 5.5, align: "left" },
        { key: "hsn", label: "HSN/SAC", weight: 1.5, align: "left" },
        { key: "qty", label: "Qty", weight: 1.4, align: "right" },
        { key: "rate", label: "Rate", weight: 1.8, align: "right" },
        { key: "amount", label: "Amount", weight: 2, align: "right" },
      ];
  const layout = layoutCols(cols);
  const bounds = [...layout.map((l) => l.x), RIGHT];
  const SIZE = 8.5;
  const HDR_H = 17;

  const drawItemsHeader = () => {
    box(MARGIN, y, CONTENT_W, HDR_H, { fill: HEADER_BG, border: false });
    hline(MARGIN, RIGHT, y);
    for (const { col, x, width } of layout) {
      cell(col.label, x, width, y - 12, col.align, { size: 8, font: bold });
    }
    vlines(bounds, y, y - HDR_H);
    y -= HDR_H;
    hline(MARGIN, RIGHT, y);
  };

  const ensureRoom = (needed: number, withHeader = false) => {
    if (y - needed < MARGIN + 24) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
      if (withHeader) drawItemsHeader();
    }
  };

  drawItemsHeader();

  inv.items.forEach((it, i) => {
    const descLines = wrapText(it.description, font, SIZE, layout[1]!.width - 8);
    const rowH = Math.max(16, descLines.length * 11 + 5);
    ensureRoom(rowH, true);
    if (i % 2 === 1) box(MARGIN, y, CONTENT_W, rowH, { fill: ZEBRA, border: false });
    const cells: Record<string, string> = {
      sr: String(i + 1),
      hsn: it.hsnCode ?? "",
      qty: `${num(it.quantity)}${it.unit ? ` ${it.unit}` : ""}`,
      rate: inr(it.rate, false),
      taxable: inr(it.taxableValue, false),
      gst: it.gstRate ? pct(it.gstRate) : "-",
      tax: inr(it.taxAmount, false),
      amount: inr(it.lineTotal, false),
    };
    const baseY = y - 12;
    for (const { col, x, width } of layout) {
      if (col.key === "desc") {
        let dy = baseY;
        for (const dl of descLines) {
          text(dl, x + 4, dy, { size: SIZE });
          dy -= 11;
        }
        continue;
      }
      const v = cells[col.key] ?? "";
      if (v) cell(v, x, width, baseY, col.align, { size: SIZE });
    }
    vlines(bounds, y, y - rowH);
    y -= rowH;
    hline(MARGIN, RIGHT, y);
  });

  // ── HSN/SAC-wise tax summary (tax invoices only) ──────────────────────────────────
  if (isTax) {
    const groups = new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>();
    for (const it of inv.items) {
      const key = `${it.hsnCode ?? ""}|${it.gstRate}`;
      const g = groups.get(key) ?? { hsn: it.hsnCode || "-", rate: it.gstRate, taxable: 0, tax: 0 };
      g.taxable += it.taxableValue;
      g.tax += it.taxAmount;
      groups.set(key, g);
    }
    const rows = [...groups.values()];
    const sumCols: Col[] = isInter
      ? [
          { key: "hsn", label: "HSN/SAC", weight: 2, align: "left" },
          { key: "taxable", label: "Taxable Value", weight: 2.2, align: "right" },
          { key: "ir", label: "IGST %", weight: 1.4, align: "right" },
          { key: "ia", label: "IGST Amt", weight: 2, align: "right" },
          { key: "tt", label: "Total Tax", weight: 2, align: "right" },
        ]
      : [
          { key: "hsn", label: "HSN/SAC", weight: 1.7, align: "left" },
          { key: "taxable", label: "Taxable Value", weight: 1.9, align: "right" },
          { key: "cr", label: "CGST %", weight: 1.1, align: "right" },
          { key: "ca", label: "CGST Amt", weight: 1.6, align: "right" },
          { key: "sr", label: "SGST %", weight: 1.1, align: "right" },
          { key: "sa", label: "SGST Amt", weight: 1.6, align: "right" },
          { key: "tt", label: "Total Tax", weight: 1.6, align: "right" },
        ];
    const sLayout = layoutCols(sumCols);
    const sBounds = [...sLayout.map((l) => l.x), RIGHT];
    const SROW = 15;

    ensureRoom((rows.length + 3) * SROW + 14);
    y -= 14;
    text("Tax Summary (HSN/SAC wise)", MARGIN, y, { size: 8, font: bold, color: MUTED });
    y -= 6;

    // header
    box(MARGIN, y, CONTENT_W, SROW, { fill: HEADER_BG, border: false });
    hline(MARGIN, RIGHT, y);
    for (const { col, x, width } of sLayout)
      cell(col.label, x, width, y - 11, col.align, { size: 7.5, font: bold });
    vlines(sBounds, y, y - SROW);
    y -= SROW;
    hline(MARGIN, RIGHT, y);

    const tot = { taxable: 0, tax: 0 };
    for (const g of rows) {
      tot.taxable += g.taxable;
      tot.tax += g.tax;
      const half = g.tax / 2;
      const data: Record<string, string> = isInter
        ? {
            hsn: g.hsn,
            taxable: inr(g.taxable, false),
            ir: pct(g.rate),
            ia: inr(g.tax, false),
            tt: inr(g.tax, false),
          }
        : {
            hsn: g.hsn,
            taxable: inr(g.taxable, false),
            cr: pct(g.rate / 2),
            ca: inr(half, false),
            sr: pct(g.rate / 2),
            sa: inr(half, false),
            tt: inr(g.tax, false),
          };
      for (const { col, x, width } of sLayout)
        cell(data[col.key] ?? "", x, width, y - 11, col.align, { size: 7.8 });
      vlines(sBounds, y, y - SROW);
      y -= SROW;
      hline(MARGIN, RIGHT, y);
    }
    // totals row
    box(MARGIN, y, CONTENT_W, SROW, { fill: HEADER_BG, border: false });
    const totData: Record<string, string> = isInter
      ? {
          hsn: "Total",
          taxable: inr(tot.taxable, false),
          ia: inr(tot.tax, false),
          tt: inr(tot.tax, false),
        }
      : {
          hsn: "Total",
          taxable: inr(tot.taxable, false),
          ca: inr(tot.tax / 2, false),
          sa: inr(tot.tax / 2, false),
          tt: inr(tot.tax, false),
        };
    for (const { col, x, width } of sLayout)
      if (totData[col.key])
        cell(totData[col.key]!, x, width, y - 11, col.align, { size: 7.8, font: bold });
    vlines(sBounds, y, y - SROW);
    y -= SROW;
    hline(MARGIN, RIGHT, y);
  }

  // ── Amount in words (left) + totals (right) ───────────────────────────────────────
  const totalRows: [string, string, boolean][] = [["Sub Total", inr(inv.subTotal), false]];
  if (inv.discountTotal > 0) totalRows.push(["Discount", `- ${inr(inv.discountTotal)}`, false]);
  if (isTax) {
    if (inv.cgstTotal > 0) totalRows.push(["CGST", inr(inv.cgstTotal), false]);
    if (inv.sgstTotal > 0) totalRows.push(["SGST", inr(inv.sgstTotal), false]);
    if (inv.igstTotal > 0) totalRows.push(["IGST", inr(inv.igstTotal), false]);
  }
  if (inv.roundOff !== 0) totalRows.push(["Round Off", inr(inv.roundOff), false]);
  totalRows.push([isTax ? "Grand Total" : "Total", inr(inv.grandTotal), true]);

  const totBoxW = CONTENT_W * 0.42;
  const wordsW = CONTENT_W - totBoxW;
  const wordLines = inv.amountInWords ? wrapText(inv.amountInWords, bold, 9, wordsW - 16) : ["-"];
  const totBoxH = totalRows.length * 16 + 8;
  const blockH = Math.max(totBoxH, 20 + wordLines.length * 12 + 10);

  ensureRoom(blockH + 8);
  y -= 8;
  // left: amount in words
  box(MARGIN, y, wordsW, blockH);
  text("Amount Chargeable (in words)", MARGIN + 8, y - 13, { size: 7.5, font: bold, color: MUTED });
  let wy = y - 28;
  for (const l of wordLines) {
    text(l, MARGIN + 8, wy, { size: 9, font: bold });
    wy -= 12;
  }
  // right: totals
  const tx = MARGIN + wordsW;
  box(tx, y, totBoxW, blockH);
  let ty = y;
  for (const [label, value, strong] of totalRows) {
    const rh = strong ? 18 : 16;
    if (strong) box(tx, ty, totBoxW, rh, { fill: HEADER_BG, border: false });
    text(label, tx + 8, ty - (strong ? 13 : 11), {
      size: strong ? 10 : 9,
      font: strong ? bold : font,
    });
    rtext(value, RIGHT - 8, ty - (strong ? 13 : 11), strong ? 10 : 9, strong ? bold : font);
    if (!strong) hline(tx, RIGHT, ty - rh, 0.4);
    ty -= rh;
  }
  y -= blockH + 12;

  // ── Notes + declaration (left) + signature (right), anchored to the page bottom ────
  const declLines = ["Certified that the particulars given above are true and correct."];
  if (isTax && inv.reverseCharge) declLines.push("Tax is payable on reverse charge basis.");
  const notesLines = inv.notes ? wrapText(inv.notes, font, 8.5, CONTENT_W * 0.52).slice(0, 3) : [];

  const SIG_H = 54;
  const leftH = (notesLines.length ? 16 + notesLines.length * 11 : 0) + 6 + declLines.length * 11;
  const footH = Math.max(SIG_H, leftH);
  ensureRoom(footH + 8);

  // Bottom-anchored: the block's baseline sits just above the bottom margin.
  let lyy = MARGIN + footH - 4;
  if (notesLines.length) {
    text("Notes / Terms", MARGIN, lyy, { size: 7.5, font: bold, color: MUTED });
    lyy -= 14;
    for (const l of notesLines) {
      text(l, MARGIN, lyy, { size: 8.5, color: MUTED });
      lyy -= 11;
    }
    lyy -= 6;
  }
  for (const l of declLines) {
    text(l, MARGIN, lyy, { size: 7.5, color: MUTED });
    lyy -= 11;
  }

  // Signature box (bottom-right). Wrap "For <seller>" so a long firm name stays inside.
  const sigW = CONTENT_W * 0.46;
  const sigX = RIGHT - sigW;
  box(sigX, MARGIN + SIG_H, sigW, SIG_H);
  let sfy = MARGIN + SIG_H - 13;
  for (const l of wrapText(`For ${inv.sellerName}`, bold, 8.5, sigW - 14).slice(0, 2)) {
    rtext(l, RIGHT - 7, sfy, 8.5, bold);
    sfy -= 11;
  }
  rtext("Authorised Signatory", RIGHT - 7, MARGIN + 9, 8, font);

  // ── Outer frame + footer on every page ────────────────────────────────────────────
  for (const p of doc.getPages()) {
    p.drawRectangle({
      x: MARGIN,
      y: MARGIN,
      width: CONTENT_W,
      height: PAGE.height - MARGIN * 2,
      borderColor: LINE,
      borderWidth: 0.9,
    });
    p.drawText("This is a computer-generated invoice.", {
      x: MARGIN,
      y: MARGIN - 13,
      size: 7,
      font,
      color: MUTED,
    });
  }

  return doc.save();
}
