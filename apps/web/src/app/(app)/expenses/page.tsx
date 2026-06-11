"use client";

import { ExpenseFormModal } from "@/components/expenses/expense-form-modal";
import { FilterDrawer, type FilterValues } from "@/components/ui/filter-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useDeleteExpense,
  useExpenses,
} from "@/lib/hooks/use-expenses";
import { useOpenOnParam } from "@/lib/hooks/use-open-on-param";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

const FILTER_FIELDS = [
  {
    type: "select" as const,
    key: "category",
    label: "Category",
    options: [
      { value: "Labour", label: "Labour" },
      { value: "Material", label: "Material" },
      { value: "Equipment", label: "Equipment" },
      { value: "Transport", label: "Transport" },
      { value: "Food", label: "Food" },
      { value: "Utilities", label: "Utilities" },
      { value: "Miscellaneous", label: "Miscellaneous" },
    ],
  },
  {
    type: "select" as const,
    key: "isPettyCash",
    label: "Type",
    options: [
      { value: "true", label: "Petty cash only" },
      { value: "false", label: "Non-petty cash only" },
    ],
  },
  {
    type: "date" as const,
    key: "dateFrom",
    label: "From date",
  },
  {
    type: "date" as const,
    key: "dateTo",
    label: "To date",
  },
];

export default function ExpensesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});

  const {
    data: expenses,
    isLoading,
    isError,
    refetch,
  } = useExpenses({
    search: search || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  const deleteExpense = useDeleteExpense();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const canCreate = can("expenses", "create");
  const canUpdate = can("expenses", "update");
  const canDelete = can("expenses", "delete");

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useOpenOnParam("new", canCreate, openCreate);

  const onDelete = async (e: Expense) => {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await deleteExpense.mutateAsync(e.id);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not delete the expense.");
    }
  };

  // Client-side filter for category / petty cash (backend supports it but we handle it here too)
  const displayed = (expenses ?? []).filter((e) => {
    if (filters.category && e.category !== filters.category) return false;
    if (filters.isPettyCash === "true" && !e.isPettyCash) return false;
    if (filters.isPettyCash === "false" && e.isPettyCash) return false;
    return true;
  });

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Record site expenses and petty cash.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="size-4" />
            Add expense
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, paid to, category"
            className="pl-8"
          />
        </div>
        <FilterDrawer fields={FILTER_FIELDS} values={filters} onChange={setFilters} />
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
        ) : displayed.length === 0 ? (
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayed.map((e) => (
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canUpdate ? (
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
