"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface Person {
  id: string;
  name: string;
}

export interface SalaryRun {
  id: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;
  totalWorkers: number;
  totalGross: number;
  totalAdvances: number;
  totalNet: number;
  generatedBy: Person | null;
  createdAt: string;
}

export interface SalaryRunItem {
  id: string;
  runId: string;
  workerId: string;
  workerName: string;
  presentDays: number;
  halfDays: number;
  payableDays: number;
  overtimeHours: number;
  dailyWage: number;
  overtimeRate: number | null;
  gross: number;
  advanceDeducted: number;
  netPayable: number;
  amountPaid: number;
  paymentStatus: PaymentStatus;
  paymentMode: string | null;
  paidAt: string | null;
}

export interface SalaryRunDetail extends SalaryRun {
  items: SalaryRunItem[];
}

export interface GenerateRunInput {
  periodStart: string;
  periodEnd: string;
}

export interface PayItemInput {
  amountPaid: number;
  paymentMode?: string | null;
  paidAt?: string;
}

const KEY = ["salary"] as const;

export function useSalaryRuns() {
  return useQuery({
    queryKey: [...KEY, "runs"],
    queryFn: () =>
      apiFetch<SalaryRun[]>("/salary/runs?pageSize=100&sortBy=periodStart&sortOrder=desc"),
  });
}

export function useSalaryRun(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "run", id],
    queryFn: () => apiFetch<SalaryRunDetail>(`/salary/runs/${id}`),
    enabled: !!id,
  });
}

export function useGenerateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateRunInput) =>
      apiFetch<SalaryRunDetail>("/salary/runs", {
        method: "POST",
        body: JSON.stringify(body),
        idempotent: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Generation settles advances → refresh attendance/advances views too.
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useDeleteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/salary/runs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function usePayItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, itemId, body }: { runId: string; itemId: string; body: PayItemInput }) =>
      apiFetch<SalaryRunItem>(`/salary/runs/${runId}/items/${itemId}/pay`, {
        method: "POST",
        body: JSON.stringify(body),
        idempotent: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
