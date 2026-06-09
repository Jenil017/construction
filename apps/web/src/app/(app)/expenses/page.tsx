"use client";

import { ExpenseFormModal } from "@/components/expenses/expense-form-modal";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type Expense,
  type ExpenseStatus,
  useDeleteExpense,
  useExpenses,
  useSetExpenseStatus,
} from "@/lib/hooks/use-expenses";
import { useOpenOnParam } from "@/lib/hooks/use-open-on-param";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

const STATUS_VARIANT: Record<ExpenseStatus, BadgeProps["variant"]> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export default function ExpensesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ExpenseStatus>("all");
  const {
    data: expenses,
    isLoading,
    isError,
    refetch,
  } = useExpenses({
    search: search || undefined,
    status: status === "all" ? undefined : status,
  });
  const setExpenseStatus = useSetExpenseStatus();
  const deleteExpense = useDeleteExpense();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const canCreate = can("expenses", "create");
  const canUpdate = can("expenses", "update");
  const canApprove = can("expenses", "approve");
  const canDelete = can("expenses", "delete");

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useOpenOnParam("new", canCreate, openCreate);

  const decide = async (e: Expense, next: "approved" | "rejected") => {
    try {
      await setExpenseStatus.mutateAsync({ id: e.id, status: next });
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not update the expense.");
    }
  };
  const onDelete = async (e: Expense) => {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await deleteExpense.mutateAsync(e.id);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not delete the expense.");
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Site expenses and petty cash with an approval workflow.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Add expense
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, paid to, category"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | ExpenseStatus)}
          className="sm:w-auto"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load expenses.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !expenses || expenses.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No expenses found.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Paid to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{e.expenseDate}</TableCell>
                    <TableCell className="font-medium">
                      {e.category}
                      {e.isPettyCash ? (
                        <Badge variant="outline" className="ml-2">
                          Petty
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">₹{e.amount}</TableCell>
                    <TableCell className="text-muted-foreground">{e.paidTo ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canApprove && e.status === "pending" ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => decide(e, "approved")}>
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:text-danger"
                              onClick={() => decide(e, "rejected")}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {canUpdate && e.status === "pending" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(e);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:text-danger"
                            onClick={() => onDelete(e)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ExpenseFormModal open={formOpen} onClose={() => setFormOpen(false)} expense={editing} />
    </div>
  );
}
