import { dpr, dprPhotos, users } from "@construction-erp/db/schema";
import { type SQL, and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Color, PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { DbClient } from "../../common/db";
import { type R2Config, getObject } from "../../common/r2";
import { type RenderedFile, fit, toAscii, wrapText } from "./reports.render";
import type { ExportParams } from "./reports.schemas";

/**
 * Photo-rich DPR export. Unlike the generic table reports, the DPR PDF lays out
 * one report per page (page-by-page) with its details *and* the site photos
 * embedded straight from R2 — so a reviewer sees what actually happened on site,
 * not just a row of text. Only the `dpr_log` + `pdf` combination uses this path;
 * CSV (and every other report) still goes through the generic dataset renderer.
 */

/** Cap reports embedded per export (image-heavy; flagged, never silent). */
export const DPR_PDF_MAX_REPORTS = 200;
/** Cap photos rendered per report (the rest are noted as "+N more"). */
export const DPR_PDF_MAX_PHOTOS = 12;

export interface DprPdfContext {
  db: DbClient;
  cfg: R2Config;
  siteId: string;
  siteName: string;
  params: ExportParams;
}

export interface DprPdfResult {
  file: RenderedFile;
  /** Number of reports included (stored as the job's rowCount). */
  reportCount: number;
}

// A4 portrait — reads better than landscape for a photo document.
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT_W = PAGE.width - MARGIN * 2;
const PHOTO_COLS = 2;
const PHOTO_GAP = 12;

interface DprRecord {
  id: string;
  reportDate: string;
  workCategory: string | null;
  location: string | null;
  status: string;
  quantityValue: string | null;
  quantityUnit: string | null;
  completedWork: string | null;
  pendingWork: string | null;
  remarks: string | null;
  createdByName: string | null;
  approvedByName: string | null;
}

interface PhotoRef {
  objectKey: string;
  fileName: string | null;
}

function periodLabel(params: ExportParams): string {
  if (params.dateFrom || params.dateTo) {
    return `${params.dateFrom ?? "start"} to ${params.dateTo ?? "today"}`;
  }
  return "all dates";
}

/** Detect a pdf-lib-embeddable image by magic bytes (content type can be null). */
function imageKind(bytes: Uint8Array): "jpg" | "png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  return null;
}

/** Center a short muted note inside a photo cell (used when an image can't render). */
function drawCellNote(
  page: PDFPage,
  font: PDFFont,
  color: Color,
  text: string,
  x: number,
  bottom: number,
  width: number,
  height: number,
): void {
  const size = 8;
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: x + (width - tw) / 2,
    y: bottom + height / 2 - size / 2,
    size,
    font,
    color,
  });
}

export async function renderDprPdf(ctx: DprPdfContext): Promise<DprPdfResult> {
  const { db, cfg, siteId, params } = ctx;

  // ── Load reports + their photos ──────────────────────────────────────────
  const creator = alias(users, "rpt_dprpdf_creator");
  const approver = alias(users, "rpt_dprpdf_approver");
  const filters: SQL[] = [eq(dpr.siteId, siteId), isNull(dpr.deletedAt)];
  if (params.dateFrom) filters.push(gte(dpr.reportDate, params.dateFrom));
  if (params.dateTo) filters.push(lte(dpr.reportDate, params.dateTo));

  const records: DprRecord[] = await db
    .select({
      id: dpr.id,
      reportDate: dpr.reportDate,
      workCategory: dpr.workCategory,
      location: dpr.location,
      status: dpr.status,
      quantityValue: dpr.quantityValue,
      quantityUnit: dpr.quantityUnit,
      completedWork: dpr.completedWork,
      pendingWork: dpr.pendingWork,
      remarks: dpr.remarks,
      createdByName: creator.name,
      approvedByName: approver.name,
    })
    .from(dpr)
    .leftJoin(creator, eq(creator.id, dpr.createdByUserId))
    .leftJoin(approver, eq(approver.id, dpr.approvedByUserId))
    .where(and(...filters))
    .orderBy(desc(dpr.reportDate), desc(dpr.createdAt))
    .limit(DPR_PDF_MAX_REPORTS);

  const photosByDpr = new Map<string, PhotoRef[]>();
  if (records.length > 0) {
    const photoRows = await db
      .select({
        dprId: dprPhotos.dprId,
        objectKey: dprPhotos.objectKey,
        fileName: dprPhotos.fileName,
      })
      .from(dprPhotos)
      .where(
        inArray(
          dprPhotos.dprId,
          records.map((r) => r.id),
        ),
      )
      .orderBy(asc(dprPhotos.createdAt));
    for (const p of photoRows) {
      const list = photosByDpr.get(p.dprId) ?? [];
      list.push({ objectKey: p.objectKey, fileName: p.fileName });
      photosByDpr.set(p.dprId, list);
    }
  }

  // ── Set up the document ──────────────────────────────────────────────────
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const INK = rgb(0.1, 0.1, 0.12);
  const MUTED = rgb(0.45, 0.45, 0.5);
  const LINE = rgb(0.82, 0.84, 0.88);
  const PILL_BG = rgb(0.93, 0.94, 0.96);

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };
  /** Ensure `needed` vertical space remains; otherwise start a fresh page. */
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 16) newPage();
  };

  const writeLines = (text: string, size: number, f: PDFFont = font, color: Color = INK) => {
    for (const ln of wrapText(text, f, size, CONTENT_W)) {
      ensure(size + 4);
      page.drawText(ln, { x: MARGIN, y: y - size, size, font: f, color });
      y -= size + 3;
    }
  };

  const fieldBlock = (label: string, value: string | null) => {
    if (!value || value.trim() === "") return;
    ensure(24);
    page.drawText(toAscii(label), { x: MARGIN, y: y - 8, size: 7.5, font: bold, color: MUTED });
    y -= 12;
    writeLines(value, 9.5);
    y -= 5;
  };

  // ── Document header ──────────────────────────────────────────────────────
  page.drawText(toAscii("DPR Photo Report"), {
    x: MARGIN,
    y: y - 17,
    size: 17,
    font: bold,
    color: INK,
  });
  y -= 24;
  const truncated = records.length >= DPR_PDF_MAX_REPORTS;
  let subtitle = `${ctx.siteName}  ·  ${periodLabel(params)}  ·  ${records.length} report${
    records.length === 1 ? "" : "s"
  }`;
  if (truncated) subtitle += `  ·  showing first ${DPR_PDF_MAX_REPORTS}`;
  page.drawText(toAscii(subtitle), { x: MARGIN, y: y - 10, size: 9, font, color: MUTED });
  y -= 20;

  if (records.length === 0) {
    page.drawText("No reports for the selected filters.", {
      x: MARGIN,
      y: y - 12,
      size: 11,
      font,
      color: MUTED,
    });
  }

  // ── One report per page ──────────────────────────────────────────────────
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r) continue;
    if (i > 0) newPage();
    else y -= 4;

    // Report title + status pill.
    page.drawText(toAscii(`DPR — ${r.reportDate}`), {
      x: MARGIN,
      y: y - 15,
      size: 14,
      font: bold,
      color: INK,
    });
    const statusText = r.status === "approved" ? "LOCKED" : "SUBMITTED";
    const pillW = bold.widthOfTextAtSize(statusText, 8) + 14;
    page.drawRectangle({
      x: PAGE.width - MARGIN - pillW,
      y: y - 17,
      width: pillW,
      height: 16,
      color: PILL_BG,
    });
    page.drawText(statusText, {
      x: PAGE.width - MARGIN - pillW + 7,
      y: y - 13,
      size: 8,
      font: bold,
      color: MUTED,
    });
    y -= 22;

    const metaParts = [
      r.workCategory,
      r.location,
      r.createdByName ? `by ${r.createdByName}` : null,
      r.approvedByName ? `locked by ${r.approvedByName}` : null,
    ].filter((p): p is string => !!p);
    if (metaParts.length > 0) {
      page.drawText(fit(toAscii(metaParts.join("  ·  ")), font, 9, CONTENT_W), {
        x: MARGIN,
        y: y - 9,
        size: 9,
        font,
        color: MUTED,
      });
      y -= 15;
    }
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE.width - MARGIN, y },
      thickness: 0.6,
      color: LINE,
    });
    y -= 12;

    // Details.
    const qty =
      r.quantityValue == null
        ? null
        : `${Number(r.quantityValue)}${r.quantityUnit ? ` ${r.quantityUnit}` : ""}`;
    fieldBlock("Completed work", r.completedWork);
    fieldBlock("Pending work", r.pendingWork);
    fieldBlock("Quantity", qty);
    fieldBlock("Remarks", r.remarks);

    // Photos.
    const allPhotos = photosByDpr.get(r.id) ?? [];
    const photos = allPhotos.slice(0, DPR_PDF_MAX_PHOTOS);
    ensure(20);
    page.drawText(`Photos (${allPhotos.length})`, {
      x: MARGIN,
      y: y - 9,
      size: 8.5,
      font: bold,
      color: MUTED,
    });
    y -= 16;

    if (allPhotos.length === 0) {
      page.drawText("No photos attached.", { x: MARGIN, y: y - 9, size: 9, font, color: MUTED });
      y -= 14;
    } else {
      const cellW = (CONTENT_W - PHOTO_GAP * (PHOTO_COLS - 1)) / PHOTO_COLS;
      const cellH = cellW * 0.7;
      for (let p = 0; p < photos.length; p += PHOTO_COLS) {
        ensure(cellH + 8);
        const rowTop = y;
        for (let c = 0; c < PHOTO_COLS && p + c < photos.length; c++) {
          const photo = photos[p + c];
          if (!photo) continue;
          const x = MARGIN + c * (cellW + PHOTO_GAP);
          const boxBottom = rowTop - cellH;
          page.drawRectangle({
            x,
            y: boxBottom,
            width: cellW,
            height: cellH,
            borderColor: LINE,
            borderWidth: 0.6,
          });

          const bytes = await getObject(cfg, photo.objectKey);
          const kind = bytes ? imageKind(bytes) : null;
          if (bytes && kind) {
            try {
              const img = kind === "jpg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
              const scale = Math.min((cellW - 6) / img.width, (cellH - 6) / img.height);
              const w = img.width * scale;
              const h = img.height * scale;
              page.drawImage(img, {
                x: x + (cellW - w) / 2,
                y: boxBottom + (cellH - h) / 2,
                width: w,
                height: h,
              });
            } catch {
              drawCellNote(
                page,
                font,
                MUTED,
                "image could not be embedded",
                x,
                boxBottom,
                cellW,
                cellH,
              );
            }
          } else {
            drawCellNote(
              page,
              font,
              MUTED,
              bytes ? "preview not supported" : "image unavailable",
              x,
              boxBottom,
              cellW,
              cellH,
            );
          }
        }
        y = rowTop - cellH - 10;
      }
      if (allPhotos.length > photos.length) {
        ensure(14);
        page.drawText(`+ ${allPhotos.length - photos.length} more photo(s) not shown`, {
          x: MARGIN,
          y: y - 8,
          size: 8,
          font,
          color: MUTED,
        });
        y -= 12;
      }
    }
  }

  // Footer page numbers.
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: PAGE.width - MARGIN - 70,
      y: MARGIN - 18,
      size: 7,
      font,
      color: MUTED,
    });
  });

  const bytes = await doc.save();
  return {
    file: { bytes, contentType: "application/pdf", ext: "pdf" },
    reportCount: records.length,
  };
}
