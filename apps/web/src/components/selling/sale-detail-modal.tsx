"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailRows, StatTiles, formatINR } from "@/components/ui/detail";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type SalePaymentStatus,
  type SaleStatus,
  type SiteSale,
  useDeleteSale,
} from "@/lib/hooks/use-selling";
import { useState } from "react";

interface SaleDetailModalProps {
  sale: SiteSale | null;
  onClose: () => void;
  onEdit: (sale: SiteSale) => void;
  onRecordPayment: (sale: SiteSale) => void;
}

const PAYMENT_VARIANT: Record<SalePaymentStatus, BadgeProps["variant"]> = {
  unpaid: "danger",
  partial: "warning",
  paid: "success",
};
const STATUS_VARIANT: Record<SaleStatus, BadgeProps["variant"]> = {
  draft: "outline",
  confirmed: "teal",
  cancelled: "danger",
};

export function SaleDetailModal({ sale, onClose, onEdit, onRecordPayment }: SaleDetailModalProps) {
  const { can } = useAuth();
  const deleteSale = useDeleteSale();
  const [error, setError] = useState<string | null>(null);

  if (!sale) return null;

  const canUpdate = can("selling", "update");
  const canDelete = can("selling", "delete");
  const isCancelled = sale.status === "cancelled";
  const outstanding = Math.max(0, sale.totalAmount - sale.amountReceived);

  const onDelete = async () => {
    if (!window.confirm("Delete this sale? The stock will be returned to inventory.")) return;
    setError(null);
    try {
      await deleteSale.mutateAsync(sale.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the sale.");
    }
  };

  return (
    <Modal
      open={!!sale}
      onClose={onClose}
      title={sale.itemDescription}
      description={sale.buyerName ? `Sold to ${sale.buyerName}` : "Sale record"}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={STATUS_VARIANT[sale.status]}>{sale.status}</Badge>
          <Badge variant={PAYMENT_VARIANT[sale.paymentStatus]}>{sale.paymentStatus}</Badge>
          <span className="text-muted-foreground">Sold on {sale.saleDate}</span>
        </div>

        <StatTiles
          items={[
            { label: "Total", value: formatINR(sale.totalAmount) },
            { label: "Received", value: formatINR(sale.amountReceived), tone: "success" },
            {
              label: "Outstanding",
              value: formatINR(outstanding),
              tone: outstanding > 0 ? "danger" : "default",
            },
          ]}
        />

        <DetailRows
          rows={[
            { label: "Item", value: sale.itemDescription },
            { label: "Quantity", value: `${sale.quantity} ${sale.unit}` },
            { label: "Rate / unit", value: `${formatINR(sale.ratePerUnit)} / ${sale.unit}` },
            { label: "Buyer", value: sale.buyerName ?? "—", hideEmpty: true },
            { label: "Buyer contact", value: sale.buyerContact ?? "—", hideEmpty: true },
            { label: "Payment mode", value: sale.paymentMode ?? "—", hideEmpty: true },
            { label: "Recorded by", value: sale.createdBy?.name ?? "—" },
            { label: "Recorded on", value: new Date(sale.createdAt).toLocaleString("en-IN") },
          ]}
        />

        {sale.notes ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="mb-1 text-xs text-muted-foreground">Notes</p>
            <p className="whitespace-pre-wrap">{sale.notes}</p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}

        {!isCancelled && (canUpdate || canDelete) ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {canUpdate && outstanding > 0 ? (
              <Button variant="outline" size="sm" onClick={() => onRecordPayment(sale)}>
                Record payment
              </Button>
            ) : null}
            {canUpdate ? (
              <Button variant="outline" size="sm" onClick={() => onEdit(sale)}>
                Edit
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                onClick={onDelete}
                disabled={deleteSale.isPending}
              >
                {deleteSale.isPending ? "Deleting…" : "Delete"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
