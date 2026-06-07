"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type SiteStatus = "active" | "inactive" | "completed";

export interface SiteRow {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  status: SiteStatus;
  role: "owner" | "member";
  memberCount: number;
  createdAt: string;
}

export interface SiteListParams {
  search?: string;
  status?: SiteStatus;
}

export interface CreateSiteInput {
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  status?: SiteStatus;
}

export interface UpdateSiteInput {
  name?: string;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  status?: SiteStatus;
}

const SITES_KEY = ["sites"] as const;

export function useSites(params: SiteListParams = {}) {
  return useQuery({
    queryKey: [...SITES_KEY, params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortBy: "name", sortOrder: "asc" });
      if (params.search) qs.set("search", params.search);
      if (params.status) qs.set("status", params.status);
      return apiFetch<SiteRow[]>(`/sites?${qs.toString()}`);
    },
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSiteInput) =>
      apiFetch<SiteRow>("/sites", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SITES_KEY }),
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSiteInput }) =>
      apiFetch<SiteRow>(`/sites/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SITES_KEY }),
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/sites/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SITES_KEY }),
  });
}
