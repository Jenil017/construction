"use client";

import { Button } from "@/components/ui/button";
import { StatTiles, formatINR } from "@/components/ui/detail";
import { Field } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { type Invoice, useRecordInvoicePayment } from "@/lib/hooks/use-invoices";
import { formMoney } from "@/lib/validation/forms";
import { PAYMENT_MODES } from "@construction-erp/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface InvoicePaymentModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice | null;
}

/**
 * The amount ceiling depends on the invoice, so the schema is built per-render
 * from the outstanding balance — the API enforces the same cap, this just
 * surfaces it inline instead of after a round-trip.
 */
function buildSchema(outstanding: number) {
  return z.object({
    amount: formMoney({ allowZero: false }).superRefine((n, ctx) => {
      // Tolerance covers float noise on a balance derived by subtraction.
      if (n > outstanding + 0.001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `That's more than the balance. Enter up to ${formatINR(outstanding)}.`,
        });
      }
    }),
    paymentMode: z.enum(PAYMENT_MODES).nullable(),
  });
}

type PaymentFormValues = z.input<ReturnType<typeof buildSchema>>;

export function InvoicePaymentModal({ open, onClose, invoice }: InvoicePaymentModalProps) {
  const recordPayment = useRecordInvoicePayment();
  const [error, setError] = useState<string | null>(null);

  const total = invoice?.grandTotal ?? 0;
  const alreadyReceived = invoice?.amountReceived ?? 0;
  const outstanding = Math.max(0, total - alreadyReceived);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(buildSchema(outstanding)),
    defaultValues: { amount: "", paymentMode: "Cash" },
  });

  useEffect(() => {
    if (!open || !invoice) return;
    setError(null);
    const remaining = Math.max(0, invoice.grandTotal - invoice.amountReceived);
    reset({
      amount: remaining > 0 ? String(remaining) : "",
      paymentMode: (invoice.paymentMode as PaymentFormValues["paymentMode"]) ?? "Cash",
    });
  }, [open, invoice, reset]);

  const amount = watch("amount");
  const addNum = Number(amount);
  const addValid = amount !== "" && !Number.isNaN(addNum) && addNum > 0;
  const newReceived = Math.min(total, alreadyReceived + (addValid ? addNum : 0));
  const newOutstanding = Math.max(0, total - newReceived);

  const onSubmit = handleSubmit(async (raw) => {
    if (!invoice) return;
    setError(null);
    const values = raw as unknown as { amount: number; paymentMode: string | null };
    // The endpoint stores the cumulative amount received.
    const cumulative = Math.min(total, alreadyReceived + values.amount);
    try {
      await recordPayment.mutateAsync({
        id: invoice.id,
        amountReceived: cumulative,
        paymentMode: values.paymentMode,
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record payment.");
    }
  });

  if (!invoice) return null;

  const fullyPaid = outstanding <= 0;
  const busy = isSubmitting || recordPayment.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Banknote}
      title="Record payment"
      description={invoice.invoiceNumber}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy || fullyPaid}>
            {busy ? "Saving…" : "Record payment"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <StatTiles
          items={[
            { label: "Grand total", value: formatINR(total) },
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
            This invoice is already fully paid.
          </div>
        ) : (
          <>
            <Field
              label="Amount received now (₹)"
              htmlFor="inv-pay-amount"
              required
              error={errors.amount?.message}
            >
              <Input
                id="inv-pay-amount"
                type="number"
                inputMode="decimal"
                min="0"
                max={outstanding}
                step="any"
                placeholder={`Up to ${formatINR(outstanding)}`}
                autoFocus
                {...register("amount")}
              />
              <button
                type="button"
                onClick={() => setValue("amount", String(outstanding), { shouldValidate: true })}
                className="mt-1.5 text-xs font-medium text-primary hover:underline"
              >
                Pay full balance ({formatINR(outstanding)})
              </button>
            </Field>

            <Field label="Payment mode" htmlFor="inv-pay-mode" error={errors.paymentMode?.message}>
              <Select id="inv-pay-mode" {...register("paymentMode")}>
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
      </form>
    </Modal>
  );
}
