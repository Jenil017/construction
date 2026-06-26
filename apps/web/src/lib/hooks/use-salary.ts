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
  /** Total payable this month (days × wage + overtime). */
  gross: number;
  /** Breakdown of `paid`: money given as advances vs as salary payments. */
  advances: number;
  payments: number;
  /** All money handed over = advances + payments. */
  paid: number;
  /** What's left to pay = gross − paid. */
  balance: number;
  paymentStatus: PaymentStatus;
}

export interface SalaryMonthTotals {
  workers: number;
  gross: number;
  advances: number;
  payments: number;
  paid: number;
  balance: number;
}

export interface SalaryMonth {
  month: string;
  totals: SalaryMonthTotals;
  workers: SalaryWorkerRow[];
}

/** One row in a worker's unified money ledger — an advance OR a salary payment. */
export interface SalaryTransaction {
  id: string;
  kind: "advance" | "payment";
  date: string;
  amount: number;
  paymentMode: string | null;
  note: string | null;
  createdBy: Person | null;
  createdAt: string;
}

export interface WorkerSalaryDetail {
  month: string;
  worker: {
    id: string;
    name: string;
    category: string | null;
    dailyWage: number;
    overtimeRate: number | null;
  };
  summary: SalaryWorkerRow;
  transactions: SalaryTransaction[];
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

/** One worker's month figures + a single chronological advance/payment ledger. */
export function useWorkerSalaryDetail(workerId: string | null, month: string) {
  return useQuery({
    queryKey: [...KEY, "worker", workerId, month],
    enabled: !!workerId && !!month,
    queryFn: () => apiFetch<WorkerSalaryDetail>(`/salary/worker/${workerId}?month=${month}`),
  });
}

// ─── Advances ──────────────────────────────────────────────────────────────────
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
