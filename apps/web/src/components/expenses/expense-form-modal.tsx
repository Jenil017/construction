"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
  type CreateExpenseInput,
  type Expense,
  type UpdateExpenseInput,
  useCreateExpense,
  useUpdateExpense,
} from "@/lib/hooks/use-expenses";
import { useEffect, useState } from "react";

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  expense?: Expense | null;
}

const MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];
const CATEGORIES = ["Fuel", "Food", "Transport", "Tools", "Labour", "Office", "Miscellaneous"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseFormModal({ open, onClose, expense }: ExpenseFormModalProps) {
  const isEdit = !!expense;
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();

  const [expenseDate, setExpenseDate] = useState(today());
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [isPettyCash, setIsPettyCash] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setExpenseDate(expense?.expenseDate ?? today());
    setCategory(expense?.category ?? "");
    setAmount(expense?.amount != null ? String(expense.amount) : "");
    setPaidTo(expense?.paidTo ?? "");
    setPaymentMode(expense?.paymentMode ?? "Cash");
    setIsPettyCash(expense?.isPettyCash ?? false);
    setDescription(expense?.description ?? "");
  }, [open, expense]);

  const submit = async () => {
    setError(null);
    if (!category.trim()) {
      setError("Category is required.");
      return;
    }
    const amt = Number(amount.trim());
    if (!amount.trim() || Number.isNaN(amt) || amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    const body: CreateExpenseInput & UpdateExpenseInput = {
      expenseDate,
      category: category.trim(),
      amount: amt,
      paidTo: paidTo.trim() || null,
      paymentMode,
      isPettyCash,
      description: description.trim() || null,
    };
    try {
      if (isEdit && expense) await updateExpense.mutateAsync({ id: expense.id, body });
      else await createExpense.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the expense.");
    }
  };

  const busy = createExpense.isPending || updateExpense.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit expense" : "New expense"}
      description={isEdit ? "Only pending expenses can be edited." : "Record a site expense."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="exp-date">Date</Label>
            <Input
              id="exp-date"
              type="date"
              max={today()}
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-amount">Amount (₹)</Label>
            <Input
              id="exp-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1500"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-category">Category</Label>
            <Input
              id="exp-category"
              list="exp-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Fuel, Food, Transport…"
            />
            <datalist id="exp-categories">
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-mode">Payment mode</Label>
            <Select
              id="exp-mode"
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="exp-paidto">Paid to</Label>
            <Input
              id="exp-paidto"
              value={paidTo}
              onChange={(e) => setPaidTo(e.target.value)}
              placeholder="Who was paid (optional)"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="exp-desc">Description</Label>
            <Input
              id="exp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPettyCash}
            onChange={(e) => setIsPettyCash(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Petty cash
        </label>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
