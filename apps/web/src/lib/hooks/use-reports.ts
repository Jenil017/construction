"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ExportFormat = "csv" | "pdf";
export type ExportStatus = "queued" | "processing" | "completed" | "failed";

export interface ReportType {
  key: string;
  label: string;
  module: string;
  dateRange: boolean;
  description: string;
}

export interface ExportParams {
  dateFrom?: string;
  dateTo?: string;
}

export interface ExportJob {
  id: string;
  siteId: string;
  reportType: string;
  reportLabel: string;
  format: ExportFormat;
  status: ExportStatus;
  params: ExportParams | null;
  fileName: string | null;
  fileSize: number | null;
  rowCount: number | null;
  errorMessage: string | null;
  attempts: number;
  requestedBy: { id: string; name: string } | null;
  completedAt: string | null;
  createdAt: string;
}

export interface CreateExportInput {
  reportType: string;
  format: ExportFormat;
  params?: ExportParams;
}

const KEY = ["reports"] as const;

export function useReportTypes() {
  return useQuery({
    queryKey: [...KEY, "types"],
    queryFn: () => apiFetch<ReportType[]>("/reports/types"),
    staleTime: 5 * 60_000,
  });
}

export function useExports() {
  return useQuery({
    queryKey: [...KEY, "exports"],
    queryFn: () => apiFetch<ExportJob[]>("/reports/exports?pageSize=100&sortOrder=desc"),
    // Poll while any job is still running so the status + download link update live.
    refetchInterval: (query) => {
      const jobs = query.state.data as ExportJob[] | undefined;
      const pending = jobs?.some((j) => j.status === "queued" || j.status === "processing");
      return pending ? 2500 : false;
    },
  });
}

export function useCreateExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExportInput) =>
      apiFetch<ExportJob>("/reports/exports", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "exports"] }),
  });
}

export function useDeleteExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/reports/exports/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "exports"] }),
  });
}

/** Fetch a short-lived presigned download link for a completed export. */
export function fetchDownloadLink(id: string) {
  return apiFetch<{ url: string; fileName: string }>(`/reports/exports/${id}/download`);
}
