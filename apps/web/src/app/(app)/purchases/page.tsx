"use client";

import { PurchaseDetailModal } from "@/components/purchases/purchase-detail-modal";
import { PurchaseFormModal } from "@/components/purchases/purchase-form-modal";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterDrawer, type FilterValues } from "@/components/ui/filter-drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth/auth-context";
import { useOpenOnParam } from "@/lib/hooks/use-open-on-param";
import {
  type PurchasePaymentStatus,
  usePurchases,
} from "@/lib/hooks/use-purchases";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { useState } from "react";

const FILTER_FIELDS = [
  {
    type: "select" as const,
    key: "paymentStatus",
    label: "Payment status",
    options: [
      { value: "unpaid", label: "Unpaid" },
      { value: "partial", label: "Partially paid" },
      { value: "paid", label: "Paid" },
    ],
  },
  { type: "date" as const, key: "dateFrom", label: "From date" },
  { type: "date" as const, key: "dateTo", label: "To date" },
];

const PAY_VARIANT: Record<PurchasePaymentStatus, BadgeProps["variant"]> = {
  unpaid: "outline",
  partial: "warning",
  paid: "success",
};

export default function PurchasesPage() {
  const { can } = useAuth();
  const [filters, setFilters] = useState<FilterValues>({});
  const {
    data: purchases,
    isLoading,
    isError,
    refetch,
  } = usePurchases({
    paymentStatus: (filters.paymentStatus as PurchasePaymentStatus) || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canCreate = can("purchases", "create");
  useOpenOnParam("new", canCreate, () => setFormOpen(true));

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Purchases</h1>
          <p className="text-sm text-muted-foreground">
            Record purchases made — items, amounts, and payments.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setFormOpen(true)} className="shrink-0">
            <Plus className="size-4" />
            New purchase
          </Button>
        ) : null}
      </div>

      <div className="flex justify-end">
        <FilterDrawer fields={FILTER_FIELDS} values={filters} onChange={setFilters} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load purchases.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !purchases || purchases.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No purchases yet.</div>
        ) : (
          <>
            {/* Mobile cards. */}
            <ul className="divide-y md:hidden">
              {purchases.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(p.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{p.sellerName ?? "—"}</span>
                        <Badge variant={PAY_VARIANT[p.paymentStatus]}>{p.paymentStatus}</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {p.poNumber ? `Ref. ${p.poNumber} · ` : ""}₹{p.total} · {p.orderDate}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop table. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seller</TableHead>
                    <TableHead>Ref. / Bill</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => setDetailId(p.id)}
                    >
                      <TableCell className="font-medium">{p.sellerName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.poNumber ? `Ref. ${p.poNumber}` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.orderDate}</TableCell>
                      <TableCell>
                        <Badge variant={PAY_VARIANT[p.paymentStatus]}>{p.paymentStatus}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">₹{p.total}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailId(p.id);
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <PurchaseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(id) => setDetailId(id)}
      />
      <PurchaseDetailModal purchaseId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
