"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AttendanceStatus = "present" | "absent" | "half_day";

export interface Person {
  id: string;
  name: string;
}

export interface WorkerCategory {
  id: string;
  name: string;
}

export interface Worker {
  id: string;
  siteId: string;
  name: string;
  phone: string | null;
  categoryId: string | null;
  category: string | null;
  trade: string | null;
  dailyWage: number;
  overtimeRate: number | null;
  notes: string | null;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  siteId: string;
  workerId: string;
  workerName: string | null;
  attendanceDate: string;
  status: AttendanceStatus;
  overtimeHours: number;
  note: string | null;
  approved: boolean;
  approvedBy: Person | null;
  markedBy: Person | null;
  createdAt: string;
}

export interface WorkerDetail extends Worker {
  recentAttendance: AttendanceRecord[];
  outstandingAdvances: number;
}

export interface CreateWorkerInput {
  name: string;
  dailyWage: number;
  phone?: string | null;
  categoryId?: string | null;
  overtimeRate?: number | null;
  notes?: string | null;
}

export type UpdateWorkerInput = Partial<CreateWorkerInput>;

export interface AttendanceListParams {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  workerId?: string;
  status?: AttendanceStatus;
  approved?: "true" | "false";
}

export interface MarkEntry {
  workerId: string;
  status: AttendanceStatus;
  overtimeHours?: number;
  note?: string | null;
}

export interface MarkAttendanceResult {
  date: string;
  saved: AttendanceRecord[];
  skippedApproved: number;
}

const KEY = ["attendance"] as const;

// ─── Worker categories ─────────────────────────────────────────────────────────
export function useWorkerCategories() {
  return useQuery({
    queryKey: [...KEY, "categories"],
    queryFn: () => apiFetch<WorkerCategory[]>("/attendance/categories"),
  });
}

export function useCreateWorkerCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<WorkerCategory>("/attendance/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "categories"] }),
  });
}

// ─── Workers ───────────────────────────────────────────────────────────────────
export function useWorkers(params: { search?: string } = {}) {
  return useQuery({
    queryKey: [...KEY, "workers", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortBy: "name", sortOrder: "asc" });
      if (params.search) qs.set("search", params.search);
      return apiFetch<Worker[]>(`/attendance/workers?${qs.toString()}`);
    },
  });
}

export function useWorker(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "worker", id],
    queryFn: () => apiFetch<WorkerDetail>(`/attendance/workers/${id}`),
    enabled: !!id,
  });
}

export function useCreateWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkerInput) =>
      apiFetch<Worker>("/attendance/workers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWorkerInput }) =>
      apiFetch<Worker>(`/attendance/workers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/attendance/workers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ─── Attendance ──────────────────────────────────────────────────────────────────
export function useAttendance(params: AttendanceListParams = {}) {
  return useQuery({
    queryKey: [...KEY, "records", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "200" });
      if (params.date) qs.set("date", params.date);
      if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
      if (params.dateTo) qs.set("dateTo", params.dateTo);
      if (params.workerId) qs.set("workerId", params.workerId);
      if (params.status) qs.set("status", params.status);
      if (params.approved) qs.set("approved", params.approved);
      return apiFetch<AttendanceRecord[]>(`/attendance?${qs.toString()}`);
    },
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; entries: MarkEntry[] }) =>
      apiFetch<MarkAttendanceResult>("/attendance", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useApproveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string }) =>
      apiFetch<{ date: string; approved: number }>("/attendance/approve", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
