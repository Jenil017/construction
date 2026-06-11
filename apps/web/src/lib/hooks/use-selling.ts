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
  materialId: string | null;
  category: string;
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

export interface SaleListParams {
  search?: string;
  category?: string;
  status?: SaleStatus;
  paymentStatus?: SalePaymentStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateSaleInput {
  saleDate?: string;
  itemDescription: string;
  materialId?: string | null;
  category: string;
  quantity: number;
  unit: string;
  ratePerUnit: number;
  buyerName?: string | null;
  buyerContact?: string | null;
  paymentMode?: string | null;
  amountReceived?: number;
  notes?: string | null;
}

export type UpdateSaleInput = Partial<Omit<CreateSaleInput, "status">>;

const KEY = ["selling"] as const;

export function useSales(params: SaleListParams = {}) {
  return useQuery({
    queryKey: [...KEY, "list", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortOrder: "desc" });
      if (params.search) qs.set("search", params.search);
      if (params.category) qs.set("category", params.category);
      if (params.status) qs.set("status", params.status);
      if (params.paymentStatus) qs.set("paymentStatus", params.paymentStatus);
      if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
      if (params.dateTo) qs.set("dateTo", params.dateTo);
      return apiFetch<SiteSale[]>(`/selling?${qs.toString()}`);
    },
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSaleInput) =>
      apiFetch<SiteSale>("/selling", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
