"use client";

import { apiFetch } from "@/lib/api-client";
import { siteStore, tokenStore } from "@/lib/auth/token-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export type InvoiceType = "tax" | "bill";
export type InvoiceStatus = "issued" | "cancelled";
export type InvoicePaymentStatus = "unpaid" | "partial" | "paid";
export type SupplyType = "intra" | "inter";

export interface Person {
  id: string;
  name: string;
}

export interface InvoiceItem {
  id: string;
  materialId: string | null;
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
}

export interface Invoice {
  id: string;
  siteId: string;
  invoiceType: InvoiceType;
  invoiceNumber: string;
  financialYear: string;
  invoiceDate: string;
  dueDate: string | null;
  supplyType: SupplyType;
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
  paymentStatus: InvoicePaymentStatus;
  amountReceived: number;
  paymentMode: string | null;
  notes: string | null;
  status: InvoiceStatus;
  createdBy: Person | null;
  createdAt: string;
  items: InvoiceItem[];
}

export interface InvoiceItemInput {
  materialId?: string | null;
  description: string;
  hsnCode?: string | null;
  quantity: number;
  unit?: string | null;
  rate: number;
  discountAmount?: number;
  gstRate?: number;
}

export interface InvoiceFormInput {
  invoiceDate?: string;
  dueDate?: string | null;
  reverseCharge?: boolean;
  placeOfSupply?: string | null;
  sellerName?: string | null;
  sellerGstin?: string | null;
  sellerAddress?: string | null;
  sellerState?: string | null;
  sellerStateCode?: string | null;
  buyerName: string;
  buyerGstin?: string | null;
  buyerAddress?: string | null;
  buyerState?: string | null;
  buyerStateCode?: string | null;
  buyerContact?: string | null;
  notes?: string | null;
  amountReceived?: number;
  paymentMode?: string | null;
  items: InvoiceItemInput[];
}

export interface CreateInvoiceInput extends InvoiceFormInput {
  invoiceType: InvoiceType;
}

export interface InvoiceListParams {
  search?: string;
  invoiceType?: InvoiceType;
  status?: InvoiceStatus;
  paymentStatus?: InvoicePaymentStatus;
  dateFrom?: string;
  dateTo?: string;
}

const KEY = ["invoices"] as const;

export function useInvoices(params: InvoiceListParams = {}) {
  return useQuery({
    queryKey: [...KEY, "list", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortOrder: "desc" });
      if (params.search) qs.set("search", params.search);
      if (params.invoiceType) qs.set("invoiceType", params.invoiceType);
      if (params.status) qs.set("status", params.status);
      if (params.paymentStatus) qs.set("paymentStatus", params.paymentStatus);
      if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
      if (params.dateTo) qs.set("dateTo", params.dateTo);
      return apiFetch<Invoice[]>(`/invoices?${qs.toString()}`);
    },
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInvoiceInput) =>
      apiFetch<Invoice>("/invoices", {
        method: "POST",
        body: JSON.stringify(body),
        idempotent: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: InvoiceFormInput }) =>
      apiFetch<Invoice>(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Invoice>(`/invoices/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "cancelled" }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRecordInvoicePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amountReceived,
      paymentMode,
    }: {
      id: string;
      amountReceived: number;
      paymentMode?: string | null;
    }) =>
      apiFetch<Invoice>(`/invoices/${id}/payment`, {
        method: "POST",
        body: JSON.stringify({ amountReceived, paymentMode }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/invoices/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Download an invoice PDF. The PDF endpoint returns binary (not the JSON
 * envelope), so this fetches it directly with the auth + site headers and
 * triggers a browser download.
 */
export async function downloadInvoicePdf(id: string, invoiceNumber: string): Promise<void> {
  const token = tokenStore.getAccess();
  const siteId = siteStore.get();
  const res = await fetch(`${API_URL}/invoices/${id}/pdf`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(siteId ? { "X-Site-Id": siteId } : {}),
    },
  });
  if (!res.ok) throw new Error("Could not download the invoice PDF.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${invoiceNumber.replace(/[/\\]/g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Client-side compute mirror (for live form totals; server is authoritative) ──
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineDraftValues {
  quantity: number;
  rate: number;
  discountAmount: number;
  gstRate: number;
}

export interface ComputedLineTotals {
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
}

export function computeLineTotals(
  l: LineDraftValues,
  opts: { invoiceType: InvoiceType },
): ComputedLineTotals {
  const taxableValue = round2(Math.max(0, l.quantity * l.rate - (l.discountAmount || 0)));
  const gstRate = opts.invoiceType === "bill" ? 0 : Math.max(0, l.gstRate || 0);
  const taxAmount = round2((taxableValue * gstRate) / 100);
  return { taxableValue, taxAmount, lineTotal: round2(taxableValue + taxAmount) };
}

export interface InvoiceTotalsPreview {
  subTotal: number;
  taxTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
}

export function computeInvoiceTotals(
  lines: LineDraftValues[],
  opts: { invoiceType: InvoiceType; supplyType: SupplyType },
): InvoiceTotalsPreview {
  let subTotal = 0;
  let taxTotal = 0;
  for (const l of lines) {
    const { taxableValue, taxAmount } = computeLineTotals(l, opts);
    subTotal += taxableValue;
    taxTotal += taxAmount;
  }
  subTotal = round2(subTotal);
  taxTotal = round2(taxTotal);
  const cgstTotal = opts.supplyType === "inter" ? 0 : round2(taxTotal / 2);
  const sgstTotal = opts.supplyType === "inter" ? 0 : round2(taxTotal - cgstTotal);
  const igstTotal = opts.supplyType === "inter" ? taxTotal : 0;
  const grandRaw = round2(subTotal + taxTotal);
  const grandTotal = Math.round(grandRaw);
  return {
    subTotal,
    taxTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    roundOff: round2(grandTotal - grandRaw),
    grandTotal,
  };
}
