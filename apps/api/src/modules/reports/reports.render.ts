import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { ReportCell, ReportColumn, ReportDataset } from "./reports.datasets";
import type { ExportFormat } from "./reports.schemas";

export interface RenderedFile {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
}

/** Standard thousands grouping with 2 decimals, e.g. -1234.5 → "-1,234.50". */
function formatMoney(n: number): string {
  const neg = n < 0;
  const [int = "0", dec = "00"] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}.${dec}`;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

/** Display string for a cell, by column type. `forCsv` keeps money/number raw. */
function cellText(value: ReportCell | undefined, col: ReportColumn, forCsv: boolean): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    if (forCsv) return String(value);
    return col.type === "money" ? formatMoney(value) : formatNumber(value);
  }
  return String(value);
}

// ─── CSV ──────────────────────────────────────────────────────────────────────────
function escapeCsv(field: string): string {
  return /[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

export function renderCsv(dataset: ReportDataset): RenderedFile {
  const lines: string[] = [];
  lines.push(dataset.columns.map((c) => escapeCsv(c.label)).join(","));
  for (const row of dataset.rows) {
    lines.push(dataset.columns.map((c) => escapeCsv(cellText(row[c.key], c, true))).join(","));
  }
  if (dataset.totals) {
    lines.push(
      dataset.columns
        .map((c) => escapeCsv(cellText(dataset.totals?.[c.key] ?? null, c, true)))
        .join(","),
    );
  }
  // Prepend a UTF-8 BOM so Excel opens it as UTF-8 (preserves ₹ and non-Latin text).
  const bytes = new TextEncoder().encode(`﻿${lines.join("\r\n")}\r\n`);
  return { bytes, contentType: "text/csv; charset=utf-8", ext: "csv" };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────────

/**
 * pdf-lib's standard fonts only encode WinAnsi (≈ Latin-1). Map the rupee sign to
 * "Rs" and drop anything outside printable ASCII to a "?" so drawing never throws.
 * Non-Latin text (e.g. Gujarati names) is best exported as CSV (UTF-8).
 */
function toAscii(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "₹") out += "Rs";
    else if (code === 9 || code === 10 || code === 13) out += " ";
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else out += "?";
  }
  return out;
}

/** Truncate text with a trailing ".." so it fits within `maxWidth`. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}..`, size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}..`;
}

const PAGE = { width: 841.89, height: 595.28 }; // A4 landscape
const MARGIN = 36;
const ROW_H = 14;
const FONT_SIZE = 8;
const PAD = 3;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.45, 0.45, 0.5);
const HEADER_BG = rgb(0.93, 0.94, 0.96);
const LINE = rgb(0.85, 0.86, 0.9);

export async function renderPdf(dataset: ReportDataset): Promise<RenderedFile> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const contentWidth = PAGE.width - MARGIN * 2;
  const totalWeight = dataset.columns.reduce((s, c) => s + (c.weight ?? 1), 0);
  // Precompute each column's x-offset + width so drawing never indexes by position.
  let acc = MARGIN;
  const layout = dataset.columns.map((col) => {
    const width = (contentWidth * (col.weight ?? 1)) / totalWeight;
    const x = acc;
    acc += width;
    return { col, x, width };
  });

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = 0;

  const drawHeaderRow = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - ROW_H + 3,
      width: contentWidth,
      height: ROW_H,
      color: HEADER_BG,
    });
    for (const { col, x: colX, width } of layout) {
      const right = col.type === "money" || col.type === "number";
      const label = fit(toAscii(col.label), bold, FONT_SIZE, width - PAD * 2);
      const tw = bold.widthOfTextAtSize(label, FONT_SIZE);
      const x = right ? colX + width - PAD - tw : colX + PAD;
      page.drawText(label, { x, y: y - ROW_H + 7, size: FONT_SIZE, font: bold, color: INK });
    }
    y -= ROW_H;
  };

  const startPage = (first: boolean) => {
    if (!first) page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
    if (first) {
      page.drawText(toAscii(dataset.title), {
        x: MARGIN,
        y: y - 14,
        size: 16,
        font: bold,
        color: INK,
      });
      y -= 22;
      if (dataset.subtitle) {
        page.drawText(toAscii(dataset.subtitle), {
          x: MARGIN,
          y: y - 10,
          size: 9,
          font,
          color: MUTED,
        });
        y -= 16;
      }
      y -= 4;
    }
    drawHeaderRow();
  };

  const drawDataRow = (cells: Record<string, ReportCell>, isTotal: boolean) => {
    if (y - ROW_H < MARGIN + 14) startPage(false);
    const rowFont = isTotal ? bold : font;
    if (isTotal) {
      page.drawLine({
        start: { x: MARGIN, y: y + 2 },
        end: { x: MARGIN + contentWidth, y: y + 2 },
        thickness: 0.7,
        color: LINE,
      });
    }
    for (const { col, x: colX, width } of layout) {
      const raw = cellText(cells[col.key], col, false);
      if (!raw) continue;
      const right = col.type === "money" || col.type === "number";
      const text = fit(toAscii(raw), rowFont, FONT_SIZE, width - PAD * 2);
      const tw = rowFont.widthOfTextAtSize(text, FONT_SIZE);
      const x = right ? colX + width - PAD - tw : colX + PAD;
      page.drawText(text, { x, y: y - ROW_H + 7, size: FONT_SIZE, font: rowFont, color: INK });
    }
    page.drawLine({
      start: { x: MARGIN, y: y - ROW_H + 3 },
      end: { x: MARGIN + contentWidth, y: y - ROW_H + 3 },
      thickness: 0.4,
      color: LINE,
    });
    y -= ROW_H;
  };

  startPage(true);
  if (dataset.rows.length === 0) {
    page.drawText("No data for the selected filters.", {
      x: MARGIN,
      y: y - 14,
      size: 10,
      font,
      color: MUTED,
    });
  } else {
    for (const row of dataset.rows) drawDataRow(row, false);
    if (dataset.totals) drawDataRow(dataset.totals, true);
  }

  // Footer page numbers.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: PAGE.width - MARGIN - 70,
      y: MARGIN - 18,
      size: 7,
      font,
      color: MUTED,
    });
  });

  const bytes = await doc.save();
  return { bytes, contentType: "application/pdf", ext: "pdf" };
}

export async function renderDataset(
  dataset: ReportDataset,
  format: ExportFormat,
): Promise<RenderedFile> {
  return format === "pdf" ? renderPdf(dataset) : renderCsv(dataset);
}
