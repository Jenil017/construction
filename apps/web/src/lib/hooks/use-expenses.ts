"use client";

import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ExpenseStatus = "pending" | "approved" | "rejected";

export interface Person {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  siteId: string;
  expenseDate: string;
  category: string;
  amount: number;
  description: string | null;
  paidTo: string | null;
  paymentMode: string | null;
  isPettyCash: boolean;
  status: ExpenseStatus;
  approvedBy: Person | null;
  createdBy: Person | null;
  createdAt: string;
}

export interface ExpenseListParams {
  search?: string;
  category?: string;
  status?: ExpenseStatus;
  pettyCash?: "true" | "false";
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateExpenseInput {
  expenseDate?: string;
  category: string;
  amount: number;
  description?: string | null;
  paidTo?: string | null;
  paymentMode?: string | null;
  isPettyCash?: boolean;
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

const KEY = ["expenses"] as const;

export function useExpenses(params: ExpenseListParams = {}) {
  return useQuery({
    queryKey: [...KEY, "list", params],
    queryFn: () => {
      const qs = new URLSearchParams({ pageSize: "100", sortOrder: "desc" });
      if (params.search) qs.set("search", params.search);
      if (params.category) qs.set("category", params.category);
      if (params.status) qs.set("status", params.status);
      if (params.pettyCash) qs.set("pettyCash", params.pettyCash);
      if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
      if (params.dateTo) qs.set("dateTo", params.dateTo);
      return apiFetch<Expense[]>(`/expenses?${qs.toString()}`);
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExpenseInput) =>
      apiFetch<Expense>("/expenses", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateExpenseInput }) =>
      apiFetch<Expense>(`/expenses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetExpenseStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      apiFetch<Expense>(`/expenses/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
