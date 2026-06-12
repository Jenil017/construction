"use client";

import { Button } from "@/components/ui/button";
import { StatTiles, formatINR } from "@/components/ui/detail";
import { Field } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { type SiteSale, useRecordSalePayment } from "@/lib/hooks/use-selling";
import { Banknote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface SalePaymentModalProps {
  open: boolean;
  onClose: () => void;
  sale: SiteSale | null;
}

const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];

export function SalePaymentModal({ open, onClose, sale }: SalePaymentModalProps) {
  const recordPayment = useRecordSalePayment();
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [error, setError] = useState<string | null>(null);

  const total = sale?.totalAmount ?? 0;
  const alreadyReceived = sale?.amountReceived ?? 0;
  const outstanding = Math.max(0, total - alreadyReceived);

  useEffect(() => {
    if (!open || !sale) return;
    setError(null);
    // Default to clearing the whole remaining balance in one tap.
    const remaining = Math.max(0, sale.totalAmount - sale.amountReceived);
    setAmount(remaining > 0 ? String(remaining) : "");
    setPaymentMode(sale.paymentMode ?? "Cash");
  }, [open, sale]);

  const addNum = Number(amount);
  const addValid = amount !== "" && !Number.isNaN(addNum) && addNum > 0;
  const newReceived = useMemo(
    () => Math.min(total, alreadyReceived + (addValid ? addNum : 0)),
    [addNum, addValid, alreadyReceived, total],
  );
  const newOutstanding = Math.max(0, total - newReceived);

  const submit = async () => {
    if (!sale) return;
    setError(null);
    if (!addValid) {
      setError("Enter the amount received now (greater than zero).");
      return;
    }
    if (addNum > outstanding + 0.001) {
      setError(`That's more than the balance. Enter up to ${formatINR(outstanding)}.`);
      return;
    }
    // The endpoint stores the cumulative amount received, so add to what's already in.
    const cumulative = Math.min(total, alreadyReceived + addNum);
    try {
      await recordPayment.mutateAsync({ id: sale.id, amountReceived: cumulative, paymentMode });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record payment.");
    }
  };

  if (!sale) return null;

  const fullyPaid = outstanding <= 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Banknote}
      title="Record payment"
      description={sale.itemDescription}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={recordPayment.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={recordPayment.isPending || fullyPaid}>
            {recordPayment.isPending ? "Saving…" : "Record payment"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <StatTiles
          items={[
            { label: "Total", value: formatINR(total) },
            { label: "Received", value: formatINR(alreadyReceived), tone: "success" },
            {
              label: "Outstanding",
              value: formatINR(outstanding),
              tone: outstanding > 0 ? "danger" : "default",
            },
          ]}
        />

        {fullyPaid ? (
          <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            This sale is already fully paid.
          </div>
        ) : (
          <>
            <Field label="Amount received now (₹)" htmlFor="pay-amount" required>
              <Input
                id="pay-amount"
                type="number"
                min="0"
                max={outstanding}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Up to ${formatINR(outstanding)}`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setAmount(String(outstanding))}
                className="mt-1.5 text-xs font-medium text-primary hover:underline"
              >
                Pay full balance ({formatINR(outstanding)})
              </button>
            </Field>

            <Field label="Payment mode" htmlFor="pay-mode">
              <Select
                id="pay-mode"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>

            {addValid ? (
              <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">After this payment: </span>
                <span className="font-medium tabular-nums">{formatINR(newReceived)} received</span>
                {newOutstanding > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatINR(newOutstanding)} still due
                  </span>
                ) : (
                  <span className="font-medium text-success"> · fully paid ✓</span>
                )}
              </div>
            ) : null}
          </>
        )}

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
