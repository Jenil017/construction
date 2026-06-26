"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
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
  type PurchasePaymentStatus,
  useDeletePurchase,
  usePayPurchase,
  usePurchase,
} from "@/lib/hooks/use-purchases";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface PurchaseDetailModalProps {
  purchaseId: string | null;
  onClose: () => void;
}

const PAY_VARIANT: Record<PurchasePaymentStatus, BadgeProps["variant"]> = {
  unpaid: "outline",
  partial: "warning",
  paid: "success",
};
const MODES = ["Cash", "Bank transfer", "UPI", "Cheque"];

export function PurchaseDetailModal({ purchaseId, onClose }: PurchaseDetailModalProps) {
  const { can } = useAuth();
  const { data: po, isLoading } = usePurchase(purchaseId);
  const payPurchase = usePayPurchase();
  const deletePurchase = useDeletePurchase();

  const [showPay, setShowPay] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [error, setError] = useState<string | null>(null);

  const canUpdate = can("purchases", "update");
  const canDelete = can("purchases", "delete");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on target change only
  useEffect(() => {
    setShowPay(false);
    setError(null);
  }, [purchaseId]);

  useEffect(() => {
    if (showPay && po) setAmountPaid(String(po.total));
  }, [showPay, po]);

  const busy = payPurchase.isPending || deletePurchase.isPending;

  const onDelete = async () => {
    if (!po) return;
    if (!window.confirm("Delete this purchase?")) return;
    try {
      await deletePurchase.mutateAsync(po.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the purchase.");
    }
  };

  const submitPay = async () => {
    if (!po) return;
    setError(null);
    const amt = Number(amountPaid);
    if (Number.isNaN(amt) || amt < 0 || amt > po.total) {
      setError(`Enter an amount between 0 and ₹${po.total}.`);
      return;
    }
    try {
      await payPurchase.mutateAsync({ id: po.id, amountPaid: amt, paymentMode });
      setShowPay(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the payment.");
    }
  };

  const footer = !showPay ? (
    <Button variant="outline" onClick={onClose}>
      Close
    </Button>
  ) : (
    <>
      <Button variant="outline" onClick={() => setShowPay(false)} disabled={busy}>
        Back
      </Button>
      <Button onClick={submitPay} disabled={busy}>
        {busy ? "Saving…" : "Record payment"}
      </Button>
    </>
  );

  return (
    <Modal
      open={!!purchaseId}
      onClose={onClose}
      title={po?.poNumber ? `Ref. ${po.poNumber}` : "Purchase"}
      description={po ? (po.sellerName ?? undefined) : undefined}
      footer={footer}
    >
      {isLoading || !po ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !showPay ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={PAY_VARIANT[po.paymentStatus]}>{po.paymentStatus}</Badge>
            <span className="text-muted-foreground">Purchased {po.orderDate}</span>
            {po.paymentMode ? (
              <span className="text-muted-foreground">· {po.paymentMode}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Total", value: `₹${po.total}` },
              ...(po.taxAmount > 0
                ? [{ label: "Tax / GST", value: `₹${po.taxAmount.toFixed(2)}` }]
                : []),
              { label: "Paid", value: `₹${po.amountPaid}` },
              { label: "Balance", value: `₹${(po.total - po.amountPaid).toFixed(2)}` },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="truncate font-semibold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Qty</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">
                      {it.description}
                      {it.materialId ? (
                        <Badge variant="teal" className="ml-2">
                          stock
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {it.quantity} {it.unit ?? ""}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      ₹{it.amount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {error ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}

          {canUpdate || canDelete ? (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {canUpdate && po.amountPaid < po.total ? (
                <Button variant="outline" size="sm" onClick={() => setShowPay(true)}>
                  Record payment
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
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="text-muted-foreground">
              Total ₹{po.total} · already paid ₹{po.amountPaid}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amt">Amount paid (₹)</Label>
              <Input
                id="pay-amt"
                type="number"
                min="0"
                max={po.total}
                step="any"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-mode-po">Payment mode</Label>
              <Select
                id="pay-mode-po"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            This sets the cumulative amount paid to the seller.
          </p>
          {error ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
