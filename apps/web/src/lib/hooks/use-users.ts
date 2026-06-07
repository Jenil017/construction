"use client";

import { apiFetch } from "@/lib/api-client";
import type { AccessLevel, RbacModule } from "@construction-erp/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ModulePermission {
  module: RbacModule;
  level: AccessLevel;
}

/** A member of the active site (the user + their per-module access here). */
export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  permissions: ModulePermission[];
}

export interface UserListParams {
  search?: string;
  status?: "active" | "disabled";
}

export interface CreateUserInput {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  permissions: ModulePermission[];
}

export interface UpdateUserInput {
  name?: string;
  phone?: string | null;
  status?: "active" | "disabled";
  password?: string;
  permissions?: ModulePermission[];
}

const USERS_KEY = ["users"] as const;

export function useUsers(params: UserListParams = {}) {
  return useQuery({
    queryKey: [...USERS_KEY, params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100" });
      if (params.search) qs.set("search", params.search);
      if (params.status) qs.set("status", params.status);
      return apiFetch<UserRow[]>(`/users?${qs.toString()}`);
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserInput) =>
      apiFetch<UserRow>("/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserInput }) =>
      apiFetch<UserRow>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; removed: boolean }>(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
