"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailRows, formatINR } from "@/components/ui/detail";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type Expense,
  type ExpenseStatus,
  useDeleteExpense,
  useSetExpenseStatus,
} from "@/lib/hooks/use-expenses";
import { useState } from "react";

interface ExpenseDetailModalProps {
  expense: Expense | null;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
}

const STATUS_VARIANT: Record<ExpenseStatus, BadgeProps["variant"]> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export function ExpenseDetailModal({ expense, onClose, onEdit }: ExpenseDetailModalProps) {
  const { can } = useAuth();
  const setStatus = useSetExpenseStatus();
  const deleteExpense = useDeleteExpense();
  const [error, setError] = useState<string | null>(null);

  if (!expense) return null;

  const canUpdate = can("expenses", "update");
  const canDelete = can("expenses", "delete");
  const canApprove = can("expenses", "approve");
  const busy = setStatus.isPending || deleteExpense.isPending;

  const decide = async (status: "approved" | "rejected") => {
    setError(null);
    try {
      await setStatus.mutateAsync({ id: expense.id, status });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update the expense.");
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this expense?")) return;
    setError(null);
    try {
      await deleteExpense.mutateAsync(expense.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the expense.");
    }
  };

  return (
    <Modal
      open={!!expense}
      onClose={onClose}
      title={expense.category}
      description={expense.paidTo ? `Paid to ${expense.paidTo}` : "Expense record"}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={STATUS_VARIANT[expense.status]}>{expense.status}</Badge>
          {expense.isPettyCash ? <Badge variant="outline">Petty cash</Badge> : null}
          <span className="text-muted-foreground">{expense.expenseDate}</span>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 text-center">
          <p className="text-xs text-muted-foreground">Amount</p>
          <p className="text-2xl font-semibold tabular-nums">{formatINR(expense.amount)}</p>
        </div>

        <DetailRows
          rows={[
            { label: "Category", value: expense.category },
            { label: "Paid to", value: expense.paidTo ?? "—", hideEmpty: true },
            { label: "Payment mode", value: expense.paymentMode ?? "—", hideEmpty: true },
            { label: "Type", value: expense.isPettyCash ? "Petty cash" : "Regular" },
            { label: "Description", value: expense.description ?? "—", hideEmpty: true },
            { label: "Approved by", value: expense.approvedBy?.name ?? "—", hideEmpty: true },
            { label: "Recorded by", value: expense.createdBy?.name ?? "—" },
            { label: "Recorded on", value: new Date(expense.createdAt).toLocaleString("en-IN") },
          ]}
        />

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}

        {canUpdate || canDelete || canApprove ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {canApprove && expense.status === "pending" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => decide("approved")}
                  disabled={busy}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:text-danger"
                  onClick={() => decide("rejected")}
                  disabled={busy}
                >
                  Reject
                </Button>
              </>
            ) : null}
            {canUpdate ? (
              <Button variant="outline" size="sm" onClick={() => onEdit(expense)} disabled={busy}>
                Edit
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                onClick={onDelete}
                disabled={busy}
              >
                {deleteExpense.isPending ? "Deleting…" : "Delete"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
