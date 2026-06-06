"use client";

import { apiFetch } from "@/lib/api-client";
import type { Permission } from "@construction-erp/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  createdAt: string;
}

export interface PermissionCatalog {
  modules: string[];
  actions: string[];
  scopes: string[];
}

export interface RoleInput {
  name: string;
  slug?: string;
  description?: string | null;
  permissions: Permission[];
}

const ROLES_KEY = ["roles"] as const;

export function useRoles() {
  return useQuery({
    queryKey: ROLES_KEY,
    queryFn: () => apiFetch<Role[]>("/roles?pageSize=100&sortOrder=asc"),
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["roles", "catalog"],
    queryFn: () => apiFetch<PermissionCatalog>("/roles/catalog"),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoleInput) =>
      apiFetch<Role>("/roles", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<RoleInput> }) =>
      apiFetch<Role>(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}
