"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type MovementType = "inward" | "outward" | "wastage" | "adjustment";

export interface Person {
  id: string;
  name: string;
}

export interface Material {
  id: string;
  siteId: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  currentStock: number;
  reorderLevel: number | null;
  unitCost: number | null;
  supplierRef: string | null;
  notes: string | null;
  lowStock: boolean;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  siteId: string;
  materialId: string;
  materialName: string | null;
  type: MovementType;
  quantity: number;
  balanceAfter: number;
  unitCost: number | null;
  reference: string | null;
  note: string | null;
  movementDate: string;
  createdBy: Person | null;
  createdAt: string;
}

export interface MaterialDetail extends Material {
  recentMovements: StockMovement[];
}

export interface MaterialListParams {
  search?: string;
  category?: string;
  status?: "low_stock";
}

export interface CreateMaterialInput {
  name: string;
  unit: string;
  sku?: string | null;
  category?: string | null;
  reorderLevel?: number | null;
  unitCost?: number | null;
  supplierRef?: string | null;
  notes?: string | null;
  openingStock?: number;
}

export type UpdateMaterialInput = Partial<Omit<CreateMaterialInput, "openingStock">>;

export interface MovementListParams {
  materialId?: string;
  type?: MovementType;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CreateMovementInput {
  materialId: string;
  type: MovementType;
  /** Positive magnitude for inward / outward / wastage. */
  quantity?: number;
  /** Counted stock for an adjustment. */
  newStock?: number;
  movementDate?: string;
  unitCost?: number | null;
  reference?: string | null;
  note?: string | null;
}

const INVENTORY_KEY = ["inventory"] as const;

export function useMaterials(params: MaterialListParams = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "materials", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortBy: "name", sortOrder: "asc" });
      if (params.search) qs.set("search", params.search);
      if (params.category) qs.set("category", params.category);
      if (params.status) qs.set("status", params.status);
      return apiFetch<Material[]>(`/inventory/materials?${qs.toString()}`);
    },
  });
}

export function useMaterial(id: string | null) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "material", id],
    queryFn: () => apiFetch<MaterialDetail>(`/inventory/materials/${id}`),
    enabled: !!id,
  });
}

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMaterialInput) =>
      apiFetch<Material>("/inventory/materials", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVENTORY_KEY }),
  });
}

export function useUpdateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMaterialInput }) =>
      apiFetch<Material>(`/inventory/materials/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVENTORY_KEY }),
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/inventory/materials/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVENTORY_KEY }),
  });
}

export function useStockMovements(params: MovementListParams = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "movements", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortOrder: "desc" });
      if (params.materialId) qs.set("materialId", params.materialId);
      if (params.type) qs.set("type", params.type);
      if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
      if (params.dateTo) qs.set("dateTo", params.dateTo);
      if (params.search) qs.set("search", params.search);
      return apiFetch<StockMovement[]>(`/inventory/movements?${qs.toString()}`);
    },
  });
}

export function useCreateStockMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMovementInput) =>
      apiFetch<StockMovement>("/inventory/movements", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVENTORY_KEY }),
  });
}
