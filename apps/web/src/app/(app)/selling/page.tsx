"use client";

import { SaleDetailModal } from "@/components/selling/sale-detail-modal";
import { SaleFormModal } from "@/components/selling/sale-form-modal";
import { SalePaymentModal } from "@/components/selling/sale-payment-modal";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/components/ui/detail";
import { FilterDrawer, type FilterValues } from "@/components/ui/filter-drawer";
import { Input } from "@/components/ui/input";
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
import { type SalePaymentStatus, type SiteSale, useSales } from "@/lib/hooks/use-selling";
import { ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";

const PAYMENT_VARIANT: Record<SalePaymentStatus, BadgeProps["variant"]> = {
  unpaid: "danger",
  partial: "warning",
  paid: "success",
};

export default function SellingPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});

  const {
    data: sales,
    isLoading,
    isError,
    refetch,
  } = useSales({
    search: search || undefined,
    paymentStatus: (filters.paymentStatus as SalePaymentStatus) || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SiteSale | null>(null);
  const [paymentSale, setPaymentSale] = useState<SiteSale | null>(null);
  const [detailSale, setDetailSale] = useState<SiteSale | null>(null);

  const canCreate = can("selling", "create");

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useOpenOnParam("new", canCreate, openCreate);

  const openEdit = (sale: SiteSale) => {
    setDetailSale(null);
    setEditing(sale);
    setFormOpen(true);
  };
  const openPayment = (sale: SiteSale) => {
    setDetailSale(null);
    setPaymentSale(sale);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Selling</h1>
          <p className="text-sm text-muted-foreground">
            Sell items from your inventory — stock updates automatically.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="size-4" />
            New sale record
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item or buyer"
            className="pl-8"
          />
        </div>
        <FilterDrawer
          fields={[
            {
              type: "select",
              key: "paymentStatus",
              label: "Payment status",
              options: [
                { value: "unpaid", label: "Unpaid" },
                { value: "partial", label: "Partially paid" },
                { value: "paid", label: "Paid" },
              ],
            },
            { type: "date", key: "dateFrom", label: "From date" },
            { type: "date", key: "dateTo", label: "To date" },
          ]}
          values={filters}
          onChange={setFilters}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load sale records.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !sales || sales.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No sale records found.
          </div>
        ) : (
          <>
            {/* Mobile cards — tap to open the full record. */}
            <ul className="divide-y md:hidden">
              {sales.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setDetailSale(s)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{s.itemDescription}</span>
                        <Badge variant={PAYMENT_VARIANT[s.paymentStatus]}>{s.paymentStatus}</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {s.quantity} {s.unit} · {formatINR(s.totalAmount)} · {s.saleDate}
                      </p>
                      {s.paymentStatus !== "paid" ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {formatINR(s.amountReceived)} received
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop table — click a row to open the full record. */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="w-full">Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => setDetailSale(s)}
                      >
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {s.saleDate}
                        </TableCell>
                        <TableCell className="max-w-[360px] truncate font-medium">
                          {s.itemDescription}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {s.quantity} {s.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(s.totalAmount)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {formatINR(s.amountReceived)}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate">{s.buyerName}</TableCell>
                        <TableCell>
                          <Badge variant={PAYMENT_VARIANT[s.paymentStatus]}>
                            {s.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailSale(s);
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
            </div>
          </>
        )}
      </div>

      <SaleDetailModal
        sale={detailSale}
        onClose={() => setDetailSale(null)}
        onEdit={openEdit}
        onRecordPayment={openPayment}
      />
      <SaleFormModal open={formOpen} onClose={() => setFormOpen(false)} sale={editing} />
      <SalePaymentModal
        open={!!paymentSale}
        onClose={() => setPaymentSale(null)}
        sale={paymentSale}
      />
    </div>
  );
}
