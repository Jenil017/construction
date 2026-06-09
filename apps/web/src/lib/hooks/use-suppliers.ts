"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Supplier {
  id: string;
  siteId: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SupplierDetail extends Supplier {
  outstanding: number;
  purchaseCount: number;
}

export interface CreateSupplierInput {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  notes?: string | null;
}

export type UpdateSupplierInput = Partial<CreateSupplierInput>;

const KEY = ["suppliers"] as const;

export function useSuppliers(params: { search?: string } = {}) {
  return useQuery({
    queryKey: [...KEY, "list", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortBy: "name", sortOrder: "asc" });
      if (params.search) qs.set("search", params.search);
      return apiFetch<Supplier[]>(`/suppliers?${qs.toString()}`);
    },
  });
}

export function useSupplier(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => apiFetch<SupplierDetail>(`/suppliers/${id}`),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSupplierInput) =>
      apiFetch<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSupplierInput }) =>
      apiFetch<Supplier>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
