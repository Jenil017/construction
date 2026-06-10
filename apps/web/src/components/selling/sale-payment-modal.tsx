"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { type SiteSale, useRecordSalePayment } from "@/lib/hooks/use-selling";
import { Banknote } from "lucide-react";
import { useEffect, useState } from "react";

interface SalePaymentModalProps {
  open: boolean;
  onClose: () => void;
  sale: SiteSale | null;
}

const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];

export function SalePaymentModal({ open, onClose, sale }: SalePaymentModalProps) {
  const recordPayment = useRecordSalePayment();
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sale) return;
    setError(null);
    setAmountReceived(sale.amountReceived > 0 ? String(sale.amountReceived) : "");
    setPaymentMode(sale.paymentMode ?? "Cash");
  }, [open, sale]);

  const submit = async () => {
    if (!sale) return;
    setError(null);
    const amt = Number(amountReceived);
    if (amountReceived === "" || Number.isNaN(amt) || amt < 0) {
      setError("Enter a valid amount (0 or more).");
      return;
    }
    try {
      await recordPayment.mutateAsync({ id: sale.id, amountReceived: amt, paymentMode });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record payment.");
    }
  };

  if (!sale) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Banknote}
      title="Record payment"
      description={`Total: ₹${sale.totalAmount.toLocaleString("en-IN")}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={recordPayment.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={recordPayment.isPending}>
            {recordPayment.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Amount received (₹)" htmlFor="pay-amount" required>
          <Input
            id="pay-amount"
            type="number"
            min="0"
            step="any"
            value={amountReceived}
            onChange={(e) => setAmountReceived(e.target.value)}
            placeholder={`Up to ₹${sale.totalAmount}`}
          />
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
        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
