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
  useRecordSalaryPayment,
  useWorkerSalaryDetail,
} from "@/lib/hooks/use-salary";
import { Loader2, Trash2, Wallet } from "lucide-react";
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
const STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Cleared",
};
const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
/** A sensible date inside the given month — today's day-of-month, clamped to the 28th. */
function dateInMonth(month: string): string {
  const day = String(Math.min(Number(today().slice(8, 10)), 28)).padStart(2, "0");
  return `${month}-${day}`;
}

type Mode = "view" | "pay";

export function WorkerSalaryModal({ row, month, onClose }: WorkerSalaryModalProps) {
  const { can } = useAuth();
  const workerId = row?.workerId ?? null;

  const [viewMonth, setViewMonth] = useState(month);
  const [mode, setMode] = useState<Mode>("view");
  const [amount, setAmount] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: detail, isLoading } = useWorkerSalaryDetail(workerId, viewMonth);
  const recordPayment = useRecordSalaryPayment();
  const deleteAdvance = useDeleteAdvance();
  const deletePayment = useDeleteSalaryPayment();

  // Reset to the page's month + view mode whenever the modal target changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on open/target change only
  useEffect(() => {
    setViewMonth(month);
    setMode("view");
    setError(null);
  }, [workerId, month]);

  if (!row) return null;

  const canUpdate = can("salary", "update");
  const canDelete = can("salary", "delete");

  const summary = detail?.summary ?? null;
  const balance = summary?.balance ?? 0;
  const noActivity = !!summary && summary.gross === 0 && summary.paid === 0;

  const openPay = () => {
    setError(null);
    setAmount(balance > 0 ? String(balance) : "");
    setPayDate(dateInMonth(viewMonth));
    setPaymentMode("Cash");
    setNote("");
    setMode("pay");
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
        periodMonth: viewMonth,
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

  const removeTransaction = async (kind: "advance" | "payment", id: string) => {
    if (!window.confirm(`Delete this ${kind}?`)) return;
    setError(null);
    try {
      if (kind === "advance") await deleteAdvance.mutateAsync(id);
      else await deletePayment.mutateAsync(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Could not delete the ${kind}.`);
    }
  };

  const busy = recordPayment.isPending;

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
        <Button onClick={submitPay} disabled={busy}>
          {busy ? "Saving…" : "Record payment"}
        </Button>
      </>
    );

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      icon={Wallet}
      title={row.workerName}
      description={detail?.worker.category ?? row.category ?? "Worker"}
      footer={footer}
    >
      {mode === "view" ? (
        <div className="space-y-4">
          {/* Status + month switcher — view this worker's pay for any month. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              {summary ? (
                noActivity ? (
                  <span className="text-muted-foreground">No activity</span>
                ) : (
                  <>
                    <Badge variant={STATUS_VARIANT[summary.paymentStatus]}>
                      {STATUS_LABEL[summary.paymentStatus]}
                    </Badge>
                    <span className="text-muted-foreground">
                      {summary.payableDays} day{summary.payableDays === 1 ? "" : "s"} worked
                    </span>
                  </>
                )
              ) : null}
            </div>
            <Input
              type="month"
              value={viewMonth}
              max={currentMonth()}
              onChange={(e) => setViewMonth(e.target.value)}
              className="w-36"
              aria-label="Month"
            />
          </div>

          {isLoading || !summary ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <>
              <StatTiles
                items={[
                  { label: "Total payable", value: formatINR(summary.gross) },
                  { label: "Paid", value: formatINR(summary.paid), tone: "success" },
                  {
                    label: "Remaining",
                    value: formatINR(summary.balance),
                    tone: summary.balance > 0 ? "danger" : "default",
                  },
                  { label: "Per day", value: formatINR(summary.dailyWage) },
                ]}
              />

              <DetailRows
                rows={[
                  { label: "Present days", value: summary.presentDays },
                  { label: "Half days", value: summary.halfDays },
                  { label: "Payable days", value: summary.payableDays },
                  {
                    label: "Overtime",
                    value:
                      summary.overtimeHours > 0
                        ? `${summary.overtimeHours} hr${summary.overtimeRate != null ? ` @ ${formatINR(summary.overtimeRate)}/hr` : ""}`
                        : "—",
                    hideEmpty: true,
                  },
                ]}
              />

              {/* Unified transaction ledger — every advance and payment, newest first. */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Transactions
                </h3>
                {!detail || detail.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments this month.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {detail.transactions.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant={t.kind === "advance" ? "warning" : "success"}>
                              {t.kind === "advance" ? "Advance" : "Payment"}
                            </Badge>
                            <span className="font-medium tabular-nums">{formatINR(t.amount)}</span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {t.date}
                            {t.paymentMode ? ` · ${t.paymentMode}` : ""}
                            {t.note ? ` · ${t.note}` : ""}
                          </p>
                        </div>
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => removeTransaction(t.kind, t.id)}
                            className="shrink-0 text-muted-foreground hover:text-danger"
                            aria-label={`Delete ${t.kind}`}
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

              {canUpdate ? (
                <div className="border-t pt-3">
                  <Button size="sm" className="w-full sm:w-auto" onClick={openPay}>
                    Record payment
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <StatTiles
            items={[
              { label: "Total payable", value: formatINR(summary?.gross ?? 0) },
              { label: "Paid", value: formatINR(summary?.paid ?? 0), tone: "success" },
              {
                label: "Remaining",
                value: formatINR(balance),
                tone: balance > 0 ? "danger" : "default",
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
