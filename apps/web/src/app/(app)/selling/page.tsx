"use client";

import { SaleFormModal } from "@/components/selling/sale-form-modal";
import { SalePaymentModal } from "@/components/selling/sale-payment-modal";
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
import { useOpenOnParam } from "@/lib/hooks/use-open-on-param";
import {
  type SalePaymentStatus,
  type SaleStatus,
  type SiteSale,
  useConfirmSale,
  useDeleteSale,
  useSales,
} from "@/lib/hooks/use-selling";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

const STATUS_VARIANT: Record<SaleStatus, BadgeProps["variant"]> = {
  draft: "warning",
  confirmed: "success",
  cancelled: "danger",
};

const PAYMENT_VARIANT: Record<SalePaymentStatus, BadgeProps["variant"]> = {
  unpaid: "danger",
  partial: "warning",
  paid: "success",
};

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function SellingPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | SaleStatus>("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | SalePaymentStatus>("all");

  const {
    data: sales,
    isLoading,
    isError,
    refetch,
  } = useSales({
    search: search || undefined,
    status: status === "all" ? undefined : status,
    paymentStatus: paymentStatus === "all" ? undefined : paymentStatus,
  });

  const confirmSale = useConfirmSale();
  const deleteSale = useDeleteSale();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SiteSale | null>(null);
  const [paymentSale, setPaymentSale] = useState<SiteSale | null>(null);

  const canCreate = can("selling", "create");
  const canUpdate = can("selling", "update");
  const canApprove = can("selling", "approve");
  const canDelete = can("selling", "delete");

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useOpenOnParam("new", canCreate, openCreate);

  const confirm = async (s: SiteSale, next: "confirmed" | "cancelled") => {
    try {
      await confirmSale.mutateAsync({ id: s.id, status: next });
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not update the sale.");
    }
  };

  const onDelete = async (s: SiteSale) => {
    if (!window.confirm("Delete this sale record?")) return;
    try {
      await deleteSale.mutateAsync(s.id);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not delete the sale record.");
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Selling</h1>
          <p className="text-sm text-muted-foreground">
            Record materials sold from the site — scrap, surplus, or unwanted items.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="size-4" />
            New sale record
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item, buyer, or category"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | SaleStatus)}
          className="sm:w-40"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value as "all" | SalePaymentStatus)}
          className="sm:w-40"
        >
          <option value="all">All payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </Select>
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{s.saleDate}</TableCell>
                    <TableCell className="max-w-[160px] truncate font-medium">
                      {s.itemDescription}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.category}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.quantity} {s.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.totalAmount)}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{s.buyerName}</TableCell>
                    <TableCell>
                      <Badge variant={PAYMENT_VARIANT[s.paymentStatus]}>{s.paymentStatus}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canApprove && s.status === "draft" ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => confirm(s, "confirmed")}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:text-danger"
                              onClick={() => confirm(s, "cancelled")}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : null}
                        {canUpdate && s.status !== "cancelled" && s.paymentStatus !== "paid" ? (
                          <Button variant="ghost" size="sm" onClick={() => setPaymentSale(s)}>
                            Payment
                          </Button>
                        ) : null}
                        {canUpdate && s.status === "draft" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(s);
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
                            onClick={() => onDelete(s)}
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

      <SaleFormModal open={formOpen} onClose={() => setFormOpen(false)} sale={editing} />
      <SalePaymentModal
        open={!!paymentSale}
        onClose={() => setPaymentSale(null)}
        sale={paymentSale}
      />
    </div>
  );
}
