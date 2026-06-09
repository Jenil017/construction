"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { type SalaryRunItem, usePayItem } from "@/lib/hooks/use-salary";
import { useEffect, useState } from "react";

interface PayItemModalProps {
  open: boolean;
  onClose: () => void;
  runId: string;
  item: SalaryRunItem | null;
}

const MODES = ["Cash", "Bank transfer", "UPI", "Cheque"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PayItemModal({ open, onClose, runId, item }: PayItemModalProps) {
  const pay = usePayItem();
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [paidAt, setPaidAt] = useState(today());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    const net = Math.max(item.netPayable, 0);
    setAmountPaid(item.amountPaid > 0 ? String(item.amountPaid) : String(net));
    setPaymentMode(item.paymentMode ?? "Cash");
    setPaidAt(today());
    setError(null);
  }, [open, item]);

  if (!item) return null;
  const net = Math.max(item.netPayable, 0);

  const submit = async () => {
    setError(null);
    const amt = Number(amountPaid.trim());
    if (Number.isNaN(amt) || amt < 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (amt > net) {
      setError(`Amount cannot exceed the net payable (₹${net}).`);
      return;
    }
    try {
      await pay.mutateAsync({
        runId,
        itemId: item.id,
        body: { amountPaid: amt, paymentMode, paidAt },
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the payment.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      description={`${item.workerName} · net payable ₹${item.netPayable}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pay.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pay.isPending}>
            {pay.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <div>
            <p className="text-muted-foreground">Gross</p>
            <p className="font-medium tabular-nums">₹{item.gross}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Advance deducted</p>
            <p className="font-medium tabular-nums">₹{item.advanceDeducted}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount paid (₹)</Label>
            <Input
              id="pay-amount"
              type="number"
              min="0"
              max={net}
              step="any"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Paid on</Label>
            <Input
              id="pay-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pay-mode">Payment mode</Label>
            <Select
              id="pay-mode"
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
          Pay the full net to mark as paid, or a smaller amount for a partial payment.
        </p>
        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
