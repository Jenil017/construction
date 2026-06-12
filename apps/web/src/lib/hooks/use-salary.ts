"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface Person {
  id: string;
  name: string;
}

export interface SalaryWorkerRow {
  workerId: string;
  workerName: string;
  category: string | null;
  dailyWage: number;
  overtimeRate: number | null;
  presentDays: number;
  halfDays: number;
  payableDays: number;
  overtimeHours: number;
  gross: number;
  advances: number;
  netPayable: number;
  paid: number;
  balance: number;
  paymentStatus: PaymentStatus;
}

export interface SalaryMonthTotals {
  workers: number;
  gross: number;
  advances: number;
  netPayable: number;
  paid: number;
  balance: number;
}

export interface SalaryMonth {
  month: string;
  totals: SalaryMonthTotals;
  workers: SalaryWorkerRow[];
}

export interface WorkerAdvance {
  id: string;
  siteId: string;
  workerId: string;
  workerName: string | null;
  amount: number;
  advanceDate: string;
  note: string | null;
  createdBy: Person | null;
  createdAt: string;
}

export interface SalaryPaymentRecord {
  id: string;
  siteId: string;
  workerId: string;
  workerName: string | null;
  periodMonth: string;
  amount: number;
  paidDate: string;
  paymentMode: string | null;
  note: string | null;
  createdBy: Person | null;
  createdAt: string;
}

const KEY = ["salary"] as const;

export function useSalaryMonth(month: string) {
  return useQuery({
    queryKey: [...KEY, "monthly", month],
    enabled: !!month,
    queryFn: () => apiFetch<SalaryMonth>(`/salary/monthly?month=${month}`),
  });
}

// ─── Advances ──────────────────────────────────────────────────────────────────
export function useWorkerAdvances(workerId: string | null, month?: string) {
  return useQuery({
    queryKey: [...KEY, "advances", workerId, month],
    enabled: !!workerId,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (workerId) qs.set("workerId", workerId);
      if (month) qs.set("month", month);
      return apiFetch<WorkerAdvance[]>(`/salary/advances?${qs.toString()}`);
    },
  });
}

export function useGiveAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      workerId: string;
      amount: number;
      advanceDate?: string;
      note?: string | null;
    }) =>
      apiFetch<WorkerAdvance>("/salary/advances", {
        method: "POST",
        body: JSON.stringify(body),
        idempotent: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/salary/advances/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ─── Payments ────────────────────────────────────────────────────────────────────
export function useWorkerPayments(workerId: string | null, month?: string) {
  return useQuery({
    queryKey: [...KEY, "payments", workerId, month],
    enabled: !!workerId,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (workerId) qs.set("workerId", workerId);
      if (month) qs.set("month", month);
      return apiFetch<SalaryPaymentRecord[]>(`/salary/payments?${qs.toString()}`);
    },
  });
}

export function useRecordSalaryPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      workerId: string;
      periodMonth: string;
      amount: number;
      paidDate?: string;
      paymentMode?: string | null;
      note?: string | null;
    }) =>
      apiFetch<SalaryPaymentRecord>("/salary/payments", {
        method: "POST",
        body: JSON.stringify(body),
        idempotent: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSalaryPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/salary/payments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
