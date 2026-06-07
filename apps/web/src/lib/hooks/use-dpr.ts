"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type DprStatus = "draft" | "submitted" | "approved";

export interface Person {
  id: string;
  name: string;
}

export interface DprPhoto {
  id: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  url: string | null;
  createdAt: string;
}

export interface DprRow {
  id: string;
  siteId: string;
  reportDate: string;
  workCategory: string | null;
  location: string | null;
  completedWork: string | null;
  pendingWork: string | null;
  quantityValue: number | null;
  quantityUnit: string | null;
  remarks: string | null;
  status: DprStatus;
  createdBy: Person | null;
  approvedBy: Person | null;
  approvedAt: string | null;
  photoCount: number;
  photos: DprPhoto[];
  createdAt: string;
}

export interface DprListParams {
  search?: string;
  status?: DprStatus;
  date?: string;
}

export interface CreateDprInput {
  reportDate: string;
  workCategory?: string | null;
  location?: string | null;
  completedWork?: string | null;
  pendingWork?: string | null;
  quantityValue?: number | null;
  quantityUnit?: string | null;
  remarks?: string | null;
  status?: "draft" | "submitted";
}

export type UpdateDprInput = Partial<CreateDprInput>;

const DPR_KEY = ["dpr"] as const;

export function useDprList(params: DprListParams = {}) {
  return useQuery({
    queryKey: [...DPR_KEY, "list", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortBy: "reportDate", sortOrder: "desc" });
      if (params.search) qs.set("search", params.search);
      if (params.status) qs.set("status", params.status);
      if (params.date) qs.set("date", params.date);
      return apiFetch<DprRow[]>(`/dpr?${qs.toString()}`);
    },
  });
}

export function useDpr(id: string | null) {
  return useQuery({
    queryKey: [...DPR_KEY, "detail", id],
    queryFn: () => apiFetch<DprRow>(`/dpr/${id}`),
    enabled: !!id,
  });
}

export function useCreateDpr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDprInput) =>
      apiFetch<DprRow>("/dpr", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DPR_KEY }),
  });
}

export function useUpdateDpr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDprInput }) =>
      apiFetch<DprRow>(`/dpr/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DPR_KEY }),
  });
}

export function useApproveDpr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<DprRow>(`/dpr/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DPR_KEY }),
  });
}

export function useDeleteDpr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/dpr/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DPR_KEY }),
  });
}

interface UploadUrlResult {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

/** Direct-to-R2 photo upload: sign → PUT to R2 → confirm metadata. */
export function useUploadDprPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dprId, file }: { dprId: string; file: File }) => {
      const signed = await apiFetch<UploadUrlResult>(`/dpr/${dprId}/photos/upload-url`, {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("Upload to storage failed.");
      return apiFetch<DprPhoto>(`/dpr/${dprId}/photos`, {
        method: "POST",
        body: JSON.stringify({
          objectKey: signed.objectKey,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DPR_KEY }),
  });
}

export function useDeleteDprPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dprId, photoId }: { dprId: string; photoId: string }) =>
      apiFetch<{ id: string; removed: boolean }>(`/dpr/${dprId}/photos/${photoId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DPR_KEY }),
  });
}
