"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailRows, StatTiles, formatINR } from "@/components/ui/detail";
import { Field } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type PaymentStatus,
  type SalaryWorkerRow,
  useDeleteAdvance,
  useDeleteSalaryPayment,
  useGiveAdvance,
  useRecordSalaryPayment,
  useWorkerAdvances,
  useWorkerPayments,
} from "@/lib/hooks/use-salary";
import { Trash2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

interface WorkerSalaryModalProps {
  row: SalaryWorkerRow | null;
  month: string;
  onClose: () => void;
}

const STATUS_VARIANT: Record<PaymentStatus, BadgeProps["variant"]> = {
  unpaid: "danger",
  partial: "warning",
  paid: "success",
};
const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type Mode = "view" | "advance" | "pay";

export function WorkerSalaryModal({ row, month, onClose }: WorkerSalaryModalProps) {
  const { can } = useAuth();
  const workerId = row?.workerId ?? null;

  const { data: advances } = useWorkerAdvances(workerId, month);
  const { data: payments } = useWorkerPayments(workerId, month);
  const giveAdvance = useGiveAdvance();
  const recordPayment = useRecordSalaryPayment();
  const deleteAdvance = useDeleteAdvance();
  const deletePayment = useDeleteSalaryPayment();

  const [mode, setMode] = useState<Mode>("view");
  const [amount, setAmount] = useState("");
  const [advDate, setAdvDate] = useState(today());
  const [payDate, setPayDate] = useState(today());
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset whenever the modal target changes
  useEffect(() => {
    setMode("view");
    setError(null);
  }, [workerId, month]);

  if (!row) return null;

  const canCreate = can("salary", "create");
  const canUpdate = can("salary", "update");
  const canDelete = can("salary", "delete");

  const openAdvance = () => {
    setError(null);
    setAmount("");
    setAdvDate(`${month}-${String(Math.min(Number(today().slice(8, 10)), 28)).padStart(2, "0")}`);
    setNote("");
    setMode("advance");
  };
  const openPay = () => {
    setError(null);
    setAmount(row.balance > 0 ? String(row.balance) : "");
    setPayDate(today());
    setPaymentMode("Cash");
    setNote("");
    setMode("pay");
  };

  const submitAdvance = async () => {
    setError(null);
    const amt = Number(amount);
    if (amount === "" || Number.isNaN(amt) || amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    try {
      await giveAdvance.mutateAsync({
        workerId: row.workerId,
        amount: amt,
        advanceDate: advDate,
        note: note.trim() || null,
      });
      setMode("view");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the advance.");
    }
  };

  const submitPay = async () => {
    setError(null);
    const amt = Number(amount);
    if (amount === "" || Number.isNaN(amt) || amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    try {
      await recordPayment.mutateAsync({
        workerId: row.workerId,
        periodMonth: month,
        amount: amt,
        paidDate: payDate,
        paymentMode,
        note: note.trim() || null,
      });
      setMode("view");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the payment.");
    }
  };

  const removeAdvance = async (id: string) => {
    if (!window.confirm("Delete this advance?")) return;
    try {
      await deleteAdvance.mutateAsync(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the advance.");
    }
  };
  const removePayment = async (id: string) => {
    if (!window.confirm("Delete this payment?")) return;
    try {
      await deletePayment.mutateAsync(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the payment.");
    }
  };

  const busy = giveAdvance.isPending || recordPayment.isPending;

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
        <Button onClick={mode === "advance" ? submitAdvance : submitPay} disabled={busy}>
          {busy ? "Saving…" : mode === "advance" ? "Give advance" : "Record payment"}
        </Button>
      </>
    );

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      icon={Wallet}
      title={row.workerName}
      description={`${row.category ?? "Worker"} · ${month}`}
      footer={footer}
    >
      {mode === "view" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={STATUS_VARIANT[row.paymentStatus]}>{row.paymentStatus}</Badge>
            <span className="text-muted-foreground">
              {row.payableDays} day{row.payableDays === 1 ? "" : "s"} worked
            </span>
          </div>

          <StatTiles
            items={[
              { label: "Gross", value: formatINR(row.gross) },
              { label: "Advances", value: formatINR(row.advances), tone: "danger" },
              { label: "Net payable", value: formatINR(row.netPayable) },
            ]}
          />
          <StatTiles
            items={[
              { label: "Paid", value: formatINR(row.paid), tone: "success" },
              {
                label: "Balance",
                value: formatINR(row.balance),
                tone: row.balance > 0 ? "danger" : "default",
              },
            ]}
          />

          <DetailRows
            rows={[
              { label: "Daily wage", value: formatINR(row.dailyWage) },
              { label: "Present days", value: row.presentDays },
              { label: "Half days", value: row.halfDays },
              { label: "Payable days", value: row.payableDays },
              {
                label: "Overtime",
                value:
                  row.overtimeHours > 0
                    ? `${row.overtimeHours} hr${row.overtimeRate != null ? ` @ ${formatINR(row.overtimeRate)}/hr` : ""}`
                    : "—",
                hideEmpty: true,
              },
            ]}
          />

          {/* Advances history */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Advances this month
            </h3>
            {!advances || advances.length === 0 ? (
              <p className="text-sm text-muted-foreground">No advances.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {advances.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium tabular-nums">{formatINR(a.amount)}</span>
                      <span className="ml-2 text-muted-foreground">{a.advanceDate}</span>
                      {a.note ? (
                        <span className="ml-2 truncate text-muted-foreground">· {a.note}</span>
                      ) : null}
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => removeAdvance(a.id)}
                        className="shrink-0 text-muted-foreground hover:text-danger"
                        aria-label="Delete advance"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Payments history */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Payments this month
            </h3>
            {!payments || payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium tabular-nums">{formatINR(p.amount)}</span>
                      <span className="ml-2 text-muted-foreground">{p.paidDate}</span>
                      {p.paymentMode ? (
                        <span className="ml-2 text-muted-foreground">· {p.paymentMode}</span>
                      ) : null}
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => removePayment(p.id)}
                        className="shrink-0 text-muted-foreground hover:text-danger"
                        aria-label="Delete payment"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}

          {canCreate || canUpdate ? (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {canCreate ? (
                <Button variant="outline" size="sm" onClick={openAdvance}>
                  Give advance
                </Button>
              ) : null}
              {canUpdate && row.balance > 0 ? (
                <Button size="sm" onClick={openPay}>
                  Record payment
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : mode === "advance" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            An advance is deducted from {row.workerName}'s net pay for the month it falls in.
          </p>
          <Field label="Amount (₹)" htmlFor="adv-amount" required>
            <Input
              id="adv-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Date" htmlFor="adv-date">
            <Input
              id="adv-date"
              type="date"
              value={advDate}
              onChange={(e) => setAdvDate(e.target.value)}
            />
          </Field>
          <Field label="Note" htmlFor="adv-note">
            <Input
              id="adv-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          {error ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <StatTiles
            items={[
              { label: "Net payable", value: formatINR(row.netPayable) },
              { label: "Paid", value: formatINR(row.paid), tone: "success" },
              {
                label: "Balance",
                value: formatINR(row.balance),
                tone: row.balance > 0 ? "danger" : "default",
              },
            ]}
          />
          <Field label="Amount paid now (₹)" htmlFor="pay-amount" required>
            <Input
              id="pay-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Date" htmlFor="pay-date">
            <Input
              id="pay-date"
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
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
          <Field label="Note" htmlFor="pay-note">
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          {error ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
