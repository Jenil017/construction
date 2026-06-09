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
  type PurchaseStatus,
  useDeletePurchase,
  usePayPurchase,
  usePurchase,
  useReceivePurchase,
  useUpdatePurchase,
} from "@/lib/hooks/use-purchases";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface PurchaseDetailModalProps {
  purchaseId: string | null;
  onClose: () => void;
}

const STATUS_VARIANT: Record<PurchaseStatus, BadgeProps["variant"]> = {
  draft: "outline",
  ordered: "brand",
  partially_received: "warning",
  received: "success",
  cancelled: "danger",
};
const PAY_VARIANT: Record<PurchasePaymentStatus, BadgeProps["variant"]> = {
  unpaid: "outline",
  partial: "warning",
  paid: "success",
};
const MODES = ["Cash", "Bank transfer", "UPI", "Cheque"];

export function PurchaseDetailModal({ purchaseId, onClose }: PurchaseDetailModalProps) {
  const { can } = useAuth();
  const { data: po, isLoading } = usePurchase(purchaseId);
  const receivePurchase = useReceivePurchase();
  const payPurchase = usePayPurchase();
  const updatePurchase = useUpdatePurchase();
  const deletePurchase = useDeletePurchase();

  const [mode, setMode] = useState<"view" | "receive" | "pay">("view");
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [error, setError] = useState<string | null>(null);

  const canUpdate = can("purchases", "update");
  const canDelete = can("purchases", "delete");

  useEffect(() => {
    setMode("view");
    setError(null);
  }, []);

  useEffect(() => {
    if (mode === "receive" && po) {
      const init: Record<string, string> = {};
      for (const it of po.items) init[it.id] = String(it.pending > 0 ? it.pending : 0);
      setReceiveQty(init);
    }
    if (mode === "pay" && po) setAmountPaid(String(po.total));
  }, [mode, po]);

  const busy =
    receivePurchase.isPending ||
    payPurchase.isPending ||
    updatePurchase.isPending ||
    deletePurchase.isPending;

  const setStatus = async (status: "ordered" | "cancelled") => {
    if (!po) return;
    if (status === "cancelled" && !window.confirm("Cancel this purchase?")) return;
    try {
      await updatePurchase.mutateAsync({ id: po.id, body: { status } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update the purchase.");
    }
  };

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

  const submitReceive = async () => {
    if (!po) return;
    setError(null);
    const items = po.items
      .map((it) => {
        const now = Number(receiveQty[it.id]) || 0;
        return { itemId: it.id, receivedQty: it.receivedQty + now, now };
      })
      .filter((x) => x.now > 0)
      .map(({ itemId, receivedQty }) => ({ itemId, receivedQty }));
    if (items.length === 0) {
      setError("Enter a quantity to receive on at least one line.");
      return;
    }
    try {
      await receivePurchase.mutateAsync({ id: po.id, items });
      setMode("view");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not receive goods.");
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
      setMode("view");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the payment.");
    }
  };

  const footer =
    mode === "view" ? (
      <Button variant="outline" onClick={onClose}>
        Close
      </Button>
    ) : (
      <>
        <Button variant="outline" onClick={() => setMode("view")} disabled={busy}>
          Back
        </Button>
        <Button onClick={mode === "receive" ? submitReceive : submitPay} disabled={busy}>
          {busy ? "Saving…" : mode === "receive" ? "Receive" : "Record payment"}
        </Button>
      </>
    );

  return (
    <Modal
      open={!!purchaseId}
      onClose={onClose}
      title={po?.poNumber ? `PO ${po.poNumber}` : "Purchase"}
      description={po ? (po.supplierName ?? undefined) : undefined}
      footer={footer}
    >
      {isLoading || !po ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : mode === "view" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={STATUS_VARIANT[po.status]}>{po.status.replace("_", " ")}</Badge>
            <Badge variant={PAY_VARIANT[po.paymentStatus]}>{po.paymentStatus}</Badge>
            <span className="text-muted-foreground">Ordered {po.orderDate}</span>
            {po.expectedDate ? (
              <span className="text-muted-foreground">· expected {po.expectedDate}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Total", value: `₹${po.total}` },
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
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Recd</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
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
                    <TableCell className="text-right tabular-nums">
                      {it.quantity} {it.unit ?? ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{it.receivedQty}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {it.pending}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">₹{it.amount}</TableCell>
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
              {canUpdate && po.status === "draft" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStatus("ordered")}
                  disabled={busy}
                >
                  Place order
                </Button>
              ) : null}
              {canUpdate && po.status !== "received" && po.status !== "cancelled" ? (
                <Button variant="outline" size="sm" onClick={() => setMode("receive")}>
                  Receive goods
                </Button>
              ) : null}
              {canUpdate && po.status !== "cancelled" && po.amountPaid < po.total ? (
                <Button variant="outline" size="sm" onClick={() => setMode("pay")}>
                  Record payment
                </Button>
              ) : null}
              {canUpdate && (po.status === "draft" || po.status === "ordered") ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-danger hover:text-danger"
                  onClick={() => setStatus("cancelled")}
                  disabled={busy}
                >
                  Cancel order
                </Button>
              ) : null}
              {canDelete && po.status !== "received" && po.status !== "partially_received" ? (
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
      ) : mode === "receive" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter the quantity received now. Material-linked lines are added to inventory stock.
          </p>
          {po.items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{it.description}</p>
                <p className="text-xs text-muted-foreground">
                  {it.receivedQty}/{it.quantity} received · {it.pending} pending
                </p>
              </div>
              <Input
                type="number"
                min="0"
                max={it.pending}
                step="any"
                value={receiveQty[it.id] ?? ""}
                onChange={(e) => setReceiveQty((q) => ({ ...q, [it.id]: e.target.value }))}
                className="w-24"
                disabled={it.pending <= 0}
              />
            </div>
          ))}
          {error ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
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
            This sets the cumulative amount paid to the supplier.
          </p>
          {error ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
