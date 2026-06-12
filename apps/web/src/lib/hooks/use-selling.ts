"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type SaleStatus = "draft" | "confirmed" | "cancelled";
export type SalePaymentStatus = "unpaid" | "partial" | "paid";

export interface Person {
  id: string;
  name: string;
}

export interface SiteSale {
  id: string;
  siteId: string;
  saleDate: string;
  itemDescription: string;
  materialId: string;
  quantity: number;
  unit: string;
  ratePerUnit: number;
  totalAmount: number;
  buyerName: string | null;
  buyerContact: string | null;
  paymentMode: string | null;
  paymentStatus: SalePaymentStatus;
  amountReceived: number;
  notes: string | null;
  status: SaleStatus;
  createdBy: Person | null;
  createdAt: string;
}

/** A sellable inventory item (only those with stock on hand). */
export interface AvailableMaterial {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  currentStock: number;
  unitCost: number | null;
}

export interface SaleListParams {
  search?: string;
  status?: SaleStatus;
  paymentStatus?: SalePaymentStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateSaleInput {
  saleDate?: string;
  materialId: string;
  quantity: number;
  ratePerUnit: number;
  buyerName?: string | null;
  buyerContact?: string | null;
  paymentMode?: string | null;
  amountReceived?: number;
  notes?: string | null;
}

/** Item + quantity are locked after creation; only these can be edited. */
export interface UpdateSaleInput {
  saleDate?: string;
  ratePerUnit?: number;
  buyerName?: string | null;
  buyerContact?: string | null;
  paymentMode?: string | null;
  notes?: string | null;
}

const KEY = ["selling"] as const;

export function useSales(params: SaleListParams = {}) {
  return useQuery({
    queryKey: [...KEY, "list", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortOrder: "desc" });
      if (params.search) qs.set("search", params.search);
      if (params.status) qs.set("status", params.status);
      if (params.paymentStatus) qs.set("paymentStatus", params.paymentStatus);
      if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
      if (params.dateTo) qs.set("dateTo", params.dateTo);
      return apiFetch<SiteSale[]>(`/selling?${qs.toString()}`);
    },
  });
}

/** In-stock materials for the sale item dropdown. */
export function useAvailableMaterials(enabled = true) {
  return useQuery({
    queryKey: [...KEY, "available-materials"],
    enabled,
    queryFn: () => apiFetch<AvailableMaterial[]>("/selling/available-materials"),
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSaleInput) =>
      apiFetch<SiteSale>("/selling", {
        method: "POST",
        body: JSON.stringify(body),
        idempotent: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Stock changed — refresh inventory views too.
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function useUpdateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSaleInput }) =>
      apiFetch<SiteSale>(`/selling/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRecordSalePayment() {
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
      apiFetch<SiteSale>(`/selling/${id}/payment`, {
        method: "POST",
        body: JSON.stringify({ amountReceived, paymentMode }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/selling/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Deleting a confirmed sale restores stock — refresh inventory.
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}
