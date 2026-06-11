"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PurchaseStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";
export type PurchasePaymentStatus = "unpaid" | "partial" | "paid";

export interface Person {
  id: string;
  name: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  materialId: string | null;
  materialName: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  rate: number;
  amount: number;
  receivedQty: number;
  pending: number;
}

export interface Purchase {
  id: string;
  siteId: string;
  sellerName: string | null;
  poNumber: string | null;
  orderDate: string;
  expectedDate: string | null;
  status: PurchaseStatus;
  notes: string | null;
  total: number;
  taxAmount: number;
  amountPaid: number;
  paymentStatus: PurchasePaymentStatus;
  paymentMode: string | null;
  createdBy: Person | null;
  createdAt: string;
}

export interface PurchaseDetail extends Purchase {
  items: PurchaseItem[];
}

export interface PurchaseLineInput {
  materialId?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  rate: number;
}

export interface CreatePurchaseInput {
  sellerName: string;
  poNumber?: string | null;
  orderDate?: string;
  notes?: string | null;
  taxAmount?: number;
  amountPaid?: number;
  paymentMode?: string | null;
  items: PurchaseLineInput[];
}

export interface UpdatePurchaseInput {
  sellerName?: string;
  poNumber?: string | null;
  orderDate?: string;
  expectedDate?: string | null;
  notes?: string | null;
  status?: "draft" | "ordered" | "cancelled";
  taxAmount?: number;
  paymentMode?: string | null;
  items?: PurchaseLineInput[];
}

export interface PurchaseListParams {
  search?: string;
  status?: PurchaseStatus;
  paymentStatus?: PurchasePaymentStatus;
  dateFrom?: string;
  dateTo?: string;
}

const KEY = ["purchases"] as const;

export function usePurchases(params: PurchaseListParams = {}) {
  return useQuery({
    queryKey: [...KEY, "list", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortBy: "orderDate", sortOrder: "desc" });
      if (params.search) qs.set("search", params.search);
      if (params.status) qs.set("status", params.status);
      if (params.paymentStatus) qs.set("paymentStatus", params.paymentStatus);
      if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
      if (params.dateTo) qs.set("dateTo", params.dateTo);
      return apiFetch<Purchase[]>(`/purchases?${qs.toString()}`);
    },
  });
}

export function usePurchase(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => apiFetch<PurchaseDetail>(`/purchases/${id}`),
    enabled: !!id,
  });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePurchaseInput) =>
      apiFetch<PurchaseDetail>("/purchases", {
        method: "POST",
        body: JSON.stringify(body),
        idempotent: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePurchaseInput }) =>
      apiFetch<PurchaseDetail>(`/purchases/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReceivePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: { itemId: string; receivedQty: number }[] }) =>
      apiFetch<PurchaseDetail>(`/purchases/${id}/receive`, {
        method: "POST",
        body: JSON.stringify({ items }),
        idempotent: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function usePayPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amountPaid,
      paymentMode,
    }: { id: string; amountPaid: number; paymentMode?: string | null }) =>
      apiFetch<Purchase>(`/purchases/${id}/pay`, {
        method: "POST",
        body: JSON.stringify({ amountPaid, paymentMode }),
        idempotent: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/purchases/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
